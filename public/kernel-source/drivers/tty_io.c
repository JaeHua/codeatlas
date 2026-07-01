/*
 * linux/drivers/tty_io.c
 *
 * (C) 1991 Linus Torvalds
 *
 * TTY (teletype) I/O driver. Handles terminal read/write,
 * line discipline, and terminal control.
 */

#include <linux/sched.h>
#include <linux/tty.h>
#include <linux/kernel.h>
#include <errno.h>
#include <asm/segment.h>
#include <asm/system.h>

struct tty_struct tty_table[NR_CONSOLES];

/*
 * Initialize all TTY structures.
 */
void tty_init(void)
{
	int i;

	for (i = 0; i < NR_CONSOLES; i++) {
		tty_table[i].read_q.data = (unsigned char *)get_free_page();
		tty_table[i].write_q.data = (unsigned char *)get_free_page();
		tty_table[i].secondary.data = (unsigned char *)get_free_page();

		INIT_QUEUE(tty_table[i].read_q);
		INIT_QUEUE(tty_table[i].write_q);
		INIT_QUEUE(tty_table[i].secondary);

		tty_table[i].pgrp = 0;
		tty_table[i].session = 0;
	}
	console_init();
}

/*
 * Copy data from a tty queue to user space.
 */
static void copy_to_cooked(struct tty_struct *tty)
{
	signed char c;

	while (!QUEUE_EMPTY(tty->read_q) && !QUEUE_FULL(tty->secondary)) {
		GETCH(tty->read_q, c);

		if (c == 13) {
			if (I_CRNL(tty))
				c = 10;
			else if (I_NOCR(tty))
				continue;
		} else if (c == 10 && I_NLCR(tty))
			c = 13;

		if (I_UCLC(tty))
			c = tolower(c);

		PUTCH(c, tty->secondary);
	}
	wake_up(&tty->secondary.proc_list);
}

/*
 * TTY read: copy from the secondary queue to user buffer.
 */
int tty_read(unsigned channel, char *buf, int nr)
{
	struct tty_struct *tty;
	char c, *b;
	int i, minimum;

	if (channel >= NR_CONSOLES)
		return -EINVAL;

	tty = &tty_table[channel];
	b = buf;

	while (nr > 0) {
		if (current->signal & ~current->blocked)
			break;

		while (QUEUE_EMPTY(tty->secondary) ||
		       (L_CANON(tty) && !QUEUE_EMPTY(tty->secondary) &&
			!QUEUE_LAST(tty->secondary, '\n') &&
			QUEUE_ROOM(tty->secondary) > TTY_BUF_SIZE / 2)) {
			if (current->signal & ~current->blocked)
				break;
			sleep_if_full(&tty->secondary);
		}

		if (QUEUE_EMPTY(tty->secondary))
			break;

		minimum = MIN(nr, QUEUE_SIZE(tty->secondary));

		i = 0;
		while (i < minimum) {
			GETCH(tty->secondary, c);
			put_fs_byte(c, b++);
			i++;
			if (c == '\n' && L_CANON(tty))
				break;
		}

		nr -= i;
	}
	wake_up(&tty->write_q.proc_list);

	return (b - buf);
}

/*
 * TTY write: copy from user buffer to the write queue.
 */
int tty_write(unsigned channel, char *buf, int nr)
{
	struct tty_struct *tty;
	char c, *b;
	int i;

	if (channel >= NR_CONSOLES)
		return -EINVAL;

	tty = &tty_table[channel];
	b = buf;

	while (nr > 0) {
		while (QUEUE_FULL(tty->write_q)) {
			tty->write_q.proc_list = current;
			schedule();
			if (current->signal & ~current->blocked)
				return (b - buf) ? (b - buf) : -EINTR;
		}

		i = MIN(nr, QUEUE_ROOM(tty->write_q));

		while (i-- > 0) {
			c = get_fs_byte(b++);
			if (O_POST(tty)) {
				if (c == '\n')
					PUTCH('\r', tty->write_q);
				PUTCH(c, tty->write_q);
			} else
				PUTCH(c, tty->write_q);
		}
		nr--;
		tty->write(tty);
	}
	return (b - buf);
}
