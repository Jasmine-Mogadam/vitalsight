cmake_minimum_required(VERSION 3.22.1)
project(smartspectra_bridge CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
list(APPEND CMAKE_MODULE_PATH "${CMAKE_CURRENT_LIST_DIR}/cmake")

find_package(SmartSpectra REQUIRED)
find_package(OpenCV REQUIRED)
find_package(PkgConfig REQUIRED)
find_package(Protobuf REQUIRED)
find_package(absl REQUIRED)
find_package(glog REQUIRED)

add_executable(smartspectra_bridge
  src/main.cc
)

target_include_directories(smartspectra_bridge PRIVATE ${OpenCV_INCLUDE_DIRS})

target_link_libraries(smartspectra_bridge
  SmartSpectra::Container
  ${OpenCV_LIBS}
  protobuf::libprotobuf
  absl::status
  absl::flags
  absl::flags_parse
  glog::glog
)

target_compile_options(smartspectra_bridge PRIVATE
  -Wall
  -Wextra
  -O2
)
