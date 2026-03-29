find_path(ABSL_INCLUDE_DIR
  NAMES absl/status/status.h
  PATHS /usr/include /usr/local/include
)

find_library(ABSL_STATUS_LIBRARY
  NAMES absl_status
  PATHS /usr/lib /usr/lib/x86_64-linux-gnu /usr/lib/aarch64-linux-gnu /usr/local/lib
)

find_library(ABSL_FLAGS_LIBRARY
  NAMES absl_flags_commandlineflag
  PATHS /usr/lib /usr/lib/x86_64-linux-gnu /usr/lib/aarch64-linux-gnu /usr/local/lib
)

find_library(ABSL_FLAGS_PARSE_LIBRARY
  NAMES absl_flags_parse
  PATHS /usr/lib /usr/lib/x86_64-linux-gnu /usr/lib/aarch64-linux-gnu /usr/local/lib
)

include(FindPackageHandleStandardArgs)
find_package_handle_standard_args(absl
  REQUIRED_VARS
    ABSL_INCLUDE_DIR
    ABSL_STATUS_LIBRARY
    ABSL_FLAGS_LIBRARY
    ABSL_FLAGS_PARSE_LIBRARY
)

if(absl_FOUND)
  if(NOT TARGET absl::status)
    add_library(absl::status UNKNOWN IMPORTED)
    set_target_properties(absl::status PROPERTIES
      IMPORTED_LOCATION "${ABSL_STATUS_LIBRARY}"
      INTERFACE_INCLUDE_DIRECTORIES "${ABSL_INCLUDE_DIR}"
    )
  endif()

  if(NOT TARGET absl::flags)
    add_library(absl::flags UNKNOWN IMPORTED)
    set_target_properties(absl::flags PROPERTIES
      IMPORTED_LOCATION "${ABSL_FLAGS_LIBRARY}"
      INTERFACE_INCLUDE_DIRECTORIES "${ABSL_INCLUDE_DIR}"
    )
  endif()

  if(NOT TARGET absl::flags_parse)
    add_library(absl::flags_parse UNKNOWN IMPORTED)
    set_target_properties(absl::flags_parse PROPERTIES
      IMPORTED_LOCATION "${ABSL_FLAGS_PARSE_LIBRARY}"
      INTERFACE_INCLUDE_DIRECTORIES "${ABSL_INCLUDE_DIR}"
    )
  endif()
endif()
