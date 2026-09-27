// The core's functions for Swift, as src-tauri/src/ios.rs defines them.
// Bytes and text handed out are freed with territory_free and
// territory_free_string.
#pragma once
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

void territory_free(uint8_t *ptr, size_t len);
void territory_free_string(char *ptr);
bool territory_open(const char *dir);
int64_t territory_session_new(int32_t mode, bool initiator);
uint8_t *territory_session_start(int64_t handle, size_t *len);
uint8_t *territory_session_feed(int64_t handle, const uint8_t *input, size_t input_len, size_t *len);
uint8_t *territory_session_confirm(int64_t handle, bool accept, size_t *len);
char *territory_session_status(int64_t handle);
void territory_session_close(int64_t handle);
uint8_t *territory_beacon(size_t *len);
char *territory_recognise(const uint8_t *beacon, size_t beacon_len);
char *territory_summary(void);
bool territory_has_file(void);
char *territory_take_file(void);
void territory_emit(const char *event, const char *payload);
char *territory_backup(void);
