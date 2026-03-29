#include <atomic>
#include <csignal>
#include <cstdlib>
#include <iostream>
#include <string>

#include <absl/flags/flag.h>
#include <absl/flags/parse.h>
#include <absl/status/status.h>
#include <glog/logging.h>
#include <physiology/modules/messages/metrics.h>
#include <smartspectra/container/foreground_container.hpp>
#include <smartspectra/container/settings.hpp>
#include <smartspectra/video_source/camera/camera.hpp>

namespace spectra = presage::smartspectra;
namespace settings = presage::smartspectra::container::settings;
namespace vs = presage::smartspectra::video_source;

ABSL_FLAG(std::string, api_key, "", "Presage Physiology API key");
ABSL_FLAG(int, camera_index, 0, "Camera device index");
ABSL_FLAG(int, capture_width, 1280, "Camera capture width");
ABSL_FLAG(int, capture_height, 720, "Camera capture height");
ABSL_FLAG(double, buffer_duration_s, 0.5, "Continuous buffer duration");
ABSL_FLAG(int, interframe_delay_ms, 20, "Interframe delay in milliseconds");
ABSL_FLAG(int, verbosity, 1, "SDK verbosity level");
ABSL_FLAG(bool, enable_edge_metrics, true, "Enable edge metrics");
ABSL_FLAG(std::string, mode, "continuous", "SmartSpectra operation mode: continuous or spot");
ABSL_FLAG(std::string, input_video_path, "", "Optional input video path for spot measurements");
ABSL_FLAG(double, spot_duration_s, 30.0, "Spot measurement duration in seconds");

namespace {

std::atomic<bool> g_should_stop = false;

void HandleSignal(int /*signal*/) {
  g_should_stop = true;
}

std::string EscapeJson(std::string value) {
  std::string escaped;
  escaped.reserve(value.size());

  for (const char ch : value) {
    switch (ch) {
      case '\\':
        escaped += "\\\\";
        break;
      case '"':
        escaped += "\\\"";
        break;
      case '\n':
        escaped += "\\n";
        break;
      case '\r':
        escaped += "\\r";
        break;
      case '\t':
        escaped += "\\t";
        break;
      default:
        escaped += ch;
        break;
    }
  }

  return escaped;
}

template <typename Container>
absl::Status RegisterCallbacks(Container& container, bool stop_on_first_metrics) {
  auto metrics_status = container.SetOnCoreMetricsOutput(
    [stop_on_first_metrics](const presage::physiology::MetricsBuffer& metrics, int64_t timestamp_microseconds) {
      const float pulse_value = metrics.has_pulse() ? metrics.pulse().strict().value() : 0.0f;
      const float breathing_value = metrics.has_breathing() ? metrics.breathing().strict().value() : 0.0f;

      const float pulse_confidence =
        metrics.has_pulse() && metrics.pulse().rate_size() > 0
          ? metrics.pulse().rate(metrics.pulse().rate_size() - 1).confidence()
          : 0.0f;
      const float breathing_confidence =
        metrics.has_breathing() && metrics.breathing().rate_size() > 0
          ? metrics.breathing().rate(metrics.breathing().rate_size() - 1).confidence()
          : 0.0f;

      const std::string measurement_id =
        metrics.has_metadata() ? metrics.metadata().id() : "";

      std::cout
        << "{"
        << "\"type\":\"metrics\","
        << "\"timestamp_microseconds\":" << timestamp_microseconds << ","
        << "\"timestamp\":\"" << EscapeJson(std::to_string(timestamp_microseconds)) << "\","
        << "\"measurementId\":\"" << EscapeJson(measurement_id) << "\","
        << "\"vitals\":{"
        << "\"heartRate\":" << pulse_value << ","
        << "\"breathingRate\":" << breathing_value << ","
        << "\"pulseConfidence\":" << pulse_confidence << ","
        << "\"breathingConfidence\":" << breathing_confidence
        << "}"
        << "}"
        << std::endl;

      if (stop_on_first_metrics) {
        return absl::CancelledError("Spot measurement complete");
      }

      if (g_should_stop.load()) {
        return absl::CancelledError("Shutdown requested");
      }

      return absl::OkStatus();
    });
  if (!metrics_status.ok()) {
    return metrics_status;
  }

  auto status_change = container.SetOnStatusChange([](presage::physiology::StatusValue status) {
    const auto status_code = status.value();
    const std::string description = presage::physiology::GetStatusDescription(status_code);

    std::cout
      << "{"
      << "\"type\":\"status\","
      << "\"code\":" << static_cast<int>(status_code) << ","
      << "\"description\":\"" << EscapeJson(description) << "\""
      << "}"
      << std::endl;

    if (g_should_stop.load()) {
      return absl::CancelledError("Shutdown requested");
    }

    return absl::OkStatus();
  });
  if (!status_change.ok()) {
    return status_change;
  }

  if (absl::GetFlag(FLAGS_enable_edge_metrics)) {
    auto edge_status = container.SetOnEdgeMetricsOutput([](const presage::physiology::Metrics& metrics) {
      if (!metrics.has_breathing() || metrics.breathing().upper_trace().empty()) {
        return absl::OkStatus();
      }

      const auto& latest_sample = *metrics.breathing().upper_trace().rbegin();

      std::cout
        << "{"
        << "\"type\":\"edge\","
        << "\"breathingTraceSample\":{"
        << "\"time\":" << latest_sample.time() << ","
        << "\"value\":" << latest_sample.value() << ","
        << "\"stable\":" << (latest_sample.stable() ? "true" : "false")
        << "}"
        << "}"
        << std::endl;

      if (g_should_stop.load()) {
        return absl::CancelledError("Shutdown requested");
      }

      return absl::OkStatus();
    });
    if (!edge_status.ok()) {
      return edge_status;
    }
  }

  return absl::OkStatus();
}

}  // namespace

int main(int argc, char** argv) {
  google::InitGoogleLogging(argv[0]);
  FLAGS_alsologtostderr = true;

  std::signal(SIGINT, HandleSignal);
  std::signal(SIGTERM, HandleSignal);

  absl::ParseCommandLine(argc, argv);

  std::string api_key = absl::GetFlag(FLAGS_api_key);
  if (api_key.empty()) {
    const char* env_api_key = std::getenv("PRESAGE_API_KEY");
    if (env_api_key != nullptr) {
      api_key = env_api_key;
    }
  }

  if (api_key.empty()) {
    std::cerr << "{\"type\":\"error\",\"message\":\"api_key is required\"}" << std::endl;
    return EXIT_FAILURE;
  }

  const std::string mode = absl::GetFlag(FLAGS_mode);
  const std::string input_video_path = absl::GetFlag(FLAGS_input_video_path);

  absl::Status status;

  if (mode == "spot") {
    settings::Settings<settings::OperationMode::Spot, settings::IntegrationMode::Rest> config{
      vs::VideoSourceSettings{
        absl::GetFlag(FLAGS_camera_index),
        vs::ResolutionSelectionMode::Auto,
        absl::GetFlag(FLAGS_capture_width),
        absl::GetFlag(FLAGS_capture_height),
        presage::camera::CameraResolutionRange::Unspecified_EnumEnd,
        presage::camera::CaptureCodec::MJPG,
        true,
        vs::InputTransformMode::Unspecified_EnumEnd,
        input_video_path,
        ""
      },
      settings::VideoSinkSettings{},
      true,
      absl::GetFlag(FLAGS_interframe_delay_ms),
      false,
      0,
      true,
      true,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      absl::GetFlag(FLAGS_verbosity),
      settings::SpotSettings{
        absl::GetFlag(FLAGS_spot_duration_s)
      },
      settings::RestSettings{
        api_key
      }
    };

    spectra::container::SpotRestForegroundContainer<presage::platform_independence::DeviceType::Cpu> container(config);
    status = RegisterCallbacks(container, true);
    if (status.ok()) {
      status = container.Initialize();
    }
    if (status.ok()) {
      status = container.Run();
    }
  } else {
    settings::Settings<settings::OperationMode::Continuous, settings::IntegrationMode::Rest> config{
      vs::VideoSourceSettings{
        absl::GetFlag(FLAGS_camera_index),
        vs::ResolutionSelectionMode::Auto,
        absl::GetFlag(FLAGS_capture_width),
        absl::GetFlag(FLAGS_capture_height),
        presage::camera::CameraResolutionRange::Unspecified_EnumEnd,
        presage::camera::CaptureCodec::MJPG,
        true,
        vs::InputTransformMode::Unspecified_EnumEnd,
        "",
        ""
      },
      settings::VideoSinkSettings{},
      true,
      absl::GetFlag(FLAGS_interframe_delay_ms),
      false,
      0,
      true,
      true,
      false,
      false,
      false,
      false,
      absl::GetFlag(FLAGS_enable_edge_metrics),
      false,
      false,
      absl::GetFlag(FLAGS_verbosity),
      settings::ContinuousSettings{
        absl::GetFlag(FLAGS_buffer_duration_s)
      },
      settings::RestSettings{
        api_key
      }
    };

    spectra::container::CpuContinuousRestForegroundContainer container(config);
    status = RegisterCallbacks(container, false);
    if (status.ok()) {
      status = container.Initialize();
    }
    if (status.ok()) {
      status = container.Run();
    }
  }

  if (!status.ok() && status.code() != absl::StatusCode::kCancelled) {
    std::cerr
      << "{\"type\":\"error\",\"message\":\""
      << EscapeJson(std::string(status.message()))
      << "\"}"
      << std::endl;
    return EXIT_FAILURE;
  }

  return EXIT_SUCCESS;
}
