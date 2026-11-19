/* Read the console itself rather than guessing from TERM. No elevated rights. */
#include <errno.h>
#include <fcntl.h>
#include <linux/kd.h>
#include <stdio.h>
#include <string.h>
#include <sys/ioctl.h>
#include <unistd.h>

int main(int argc, char **argv) {
    const char *path = argc > 1 ? argv[1] : "/dev/tty";
    if (argc > 2) { fprintf(stderr, "usage: shaddai-console [TTY]\n"); return 2; }
    int fd = open(path, O_RDONLY | O_NOCTTY | O_CLOEXEC);
    if (fd < 0) { fprintf(stderr, "%s: %s\n", path, strerror(errno)); return 1; }
    int mode;
    if (ioctl(fd, KDGETMODE, &mode) < 0) {
        fprintf(stderr, "%s: not an accessible Linux virtual console (%s)\n", path, strerror(errno));
        close(fd); return 1;
    }
    struct winsize size = {0};
    struct console_font_op font = {.op = KD_FONT_OP_GET, .data = NULL};
    if (ioctl(fd, TIOCGWINSZ, &size) < 0 || ioctl(fd, KDFONTOP, &font) < 0) {
        fprintf(stderr, "%s: %s\n", path, strerror(errno)); close(fd); return 1;
    }
    printf("mode=%s rows=%u columns=%u font=%ux%u glyphs=%u\n",
           mode == KD_TEXT ? "text" : "graphics", size.ws_row, size.ws_col,
           font.width, font.height, font.charcount);
    close(fd);
    return 0;
}
