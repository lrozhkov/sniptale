#include <dlfcn.h>
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

typedef struct _XDisplay Display;
typedef unsigned char KeyCode;
typedef unsigned long KeySym;

int main(int argc, char **argv) {
  void *x11 = dlopen("libX11.so.6", RTLD_NOW);
  void *xtst = dlopen("libXtst.so.6", RTLD_NOW);
  if (!x11 || !xtst) return 2;

  Display *(*open_display)(const char *) = dlsym(x11, "XOpenDisplay");
  KeySym (*string_to_keysym)(const char *) = dlsym(x11, "XStringToKeysym");
  KeyCode (*keysym_to_keycode)(Display *, KeySym) = dlsym(x11, "XKeysymToKeycode");
  int (*fake_key_event)(Display *, unsigned int, int, unsigned long) =
      dlsym(xtst, "XTestFakeKeyEvent");
  int (*flush)(Display *) = dlsym(x11, "XFlush");
  if (!open_display || !string_to_keysym || !keysym_to_keycode || !fake_key_event || !flush) {
    return 3;
  }

  Display *display = open_display(NULL);
  if (!display) return 4;
  usleep(500000);
  for (int index = 1; index < argc; index += 1) {
    KeyCode code = keysym_to_keycode(display, string_to_keysym(argv[index]));
    if (!code) return 5;
    fake_key_event(display, code, 1, 0);
    fake_key_event(display, code, 0, 0);
    flush(display);
    usleep(150000);
  }
  return 0;
}
