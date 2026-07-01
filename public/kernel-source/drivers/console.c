/*
 * linux/drivers/console.c
 *
 * (C) 1991 Linus Torvalds
 *
 * Console output driver. Writes characters to the VGA text-mode
 * framebuffer and handles scrolling.
 */

#include <linux/sched.h>
#include <linux/tty.h>
#include <linux/kernel.h>
#include <asm/system.h>
#include <asm/io.h>

#define SCREEN_START 0xb8000
#define SCREEN_END   0xc0000
#define LINES 25
#define COLUMNS 80
#define NPAR 16

static unsigned long origin = SCREEN_START;
static unsigned long scr_end = SCREEN_START + LINES * COLUMNS * 2;
static unsigned long pos;
static unsigned long x, y;
static unsigned long top = 0, bottom = LINES;
static unsigned long lines = LINES, columns = COLUMNS;
static unsigned long state = 0;
static unsigned long npar, par[NPAR];
static unsigned long ques = 0;
static unsigned char attr = 0x07;

/*
 * Scroll the console up by one line.
 */
static void scrup(void)
{
	unsigned long i;

	if (!top && bottom == lines) {
		origin += columns * 2;
		pos += columns * 2;
		scr_end += columns * 2;

		if (scr_end > SCREEN_END) {
			memcpy((void *)SCREEN_START,
			       (void *)(origin - columns * 2),
			       (lines - 1) * columns * 2);
			origin = SCREEN_START;
			pos = origin + (y * columns + x) * 2;
			scr_end = origin + lines * columns * 2;

			for (i = (lines - 1) * columns * 2;
			     i < lines * columns * 2; i += 2)
				*(unsigned short *)(origin + i) = 0x0720;
		}
	} else {
		for (i = top * columns * 2;
		     i < (bottom - 1) * columns * 2; i += 2)
			*(unsigned short *)(origin + i) =
				*(unsigned short *)(origin + i + columns * 2);

		for (i = (bottom - 1) * columns * 2;
		     i < bottom * columns * 2; i += 2)
			*(unsigned short *)(origin + i) = 0x0720;
	}
}

/*
 * Write a character to the console.
 */
void con_write(struct tty_struct *tty)
{
	int nr;
	char c;

	nr = QUEUE_SIZE(tty->write_q);
	while (nr--) {
		GETCH(tty->write_q, c);
		switch (state) {
		case 0:
			if (c == 27) {
				state = 1;
				break;
			}
			if (c == 10 || c == 11 || c == 12) {
				cr();
				lf();
				break;
			}
			if (c == 13)
				cr();
			if (c == 8) {
				if (x > 0)
					x--;
				break;
			}
			if (c == 9)
				c = 9 - (x % 8);

			while (c-- > 0) {
				*(unsigned short *)(pos) = 0x20 | (attr << 8);
				pos += 2;
				x++;
				if (x >= columns) {
					x = 0;
					pos -= columns * 2;
					lf();
				}
			}
			c = 0;
			break;
		case 1:
			/* ESC [ sequence handling */
			if (c == '[') {
				state = 2;
				break;
			}
			state = 0;
			break;
		case 2:
			/* Parse numeric parameters */
			for (npar = 0; npar < NPAR; npar++)
				par[npar] = 0;
			npar = 0;
			state = 3;
			/* fall through */
		case 3:
			if (c >= '0' && c <= '9') {
				par[npar] = 10 * par[npar] + c - '0';
				break;
			} else if (c == ';') {
				npar++;
				break;
			}
			state = 0;
			break;
		}
	}
	set_cursor();
}

static void cr(void)
{
	pos -= x * 2;
	x = 0;
}

static void lf(void)
{
	if (y + 1 < bottom) {
		y++;
		pos += columns * 2;
		return;
	}
	scrup();
}

static void set_cursor(void)
{
	/* Program the VGA cursor position */
	outb_p(14, 0x3d4);
	outb_p(0xff & ((pos - origin) / 2 >> 8), 0x3d5);
	outb_p(15, 0x3d4);
	outb_p(0xff & ((pos - origin) / 2), 0x3d5);
}

void console_init(void)
{
	origin = SCREEN_START;
	scr_end = SCREEN_START + lines * columns * 2;
	top = 0;
	bottom = lines;
	x = 0;
	y = 0;
	pos = origin;
	set_cursor();
}
