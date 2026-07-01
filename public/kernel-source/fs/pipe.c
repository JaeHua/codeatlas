/*
 * linux/fs/pipe.c
 *
 * (C) 1991 Linus Torvalds
 *
 * Pipe IPC implementation.
 */

#include <linux/sched.h>
#include <linux/kernel.h>
#include <linux/fs.h>
#include <errno.h>
#include <asm/system.h>
#include <asm/segment.h>

/*
 * sys_pipe() - create a pair of file descriptors for a pipe.
 */
int sys_pipe(unsigned long *fildes)
{
	struct inode *inode;
	struct file *f[2];
	int fd[2];
	int i;

	for (i = 0; i < 2; i++) {
		fd[i] = get_unused_fd();
		if (fd[i] < 0)
			goto cleanup;
	}

	for (i = 0; i < 2; i++) {
		f[i] = get_empty_filp();
		if (!f[i])
			goto cleanup;
	}

	inode = get_pipe_inode();
	if (!inode)
		goto cleanup;

	f[0]->f_inode = inode;
	f[0]->f_pos = 0;
	f[0]->f_mode = 1;	/* read */
	f[0]->f_flags = 0;

	f[1]->f_inode = inode;
	f[1]->f_pos = 0;
	f[1]->f_mode = 2;	/* write */
	f[1]->f_flags = 0;

	current->filp[fd[0]] = f[0];
	current->filp[fd[1]] = f[1];

	put_fs_long(fd[0], 0 + fildes);
	put_fs_long(fd[1], 1 + fildes);

	return 0;

cleanup:
	for (i = 0; i < 2; i++) {
		if (fd[i] >= 0)
			sys_close(fd[i]);
	}
	return -ENFILE;
}

/*
 * Read from a pipe.
 */
int pipe_read(struct inode *inode, char *buf, int count)
{
	int chars, size, written;

	while (!PIPE_SIZE(*inode)) {
		wake_up(&PIPE_WRITE_WAIT(*inode));
		if (inode->i_count < 2)
			return 0;
		sleep_on(&PIPE_READ_WAIT(*inode));
	}

	size = PIPE_SIZE(*inode);
	chars = PAGE_SIZE - PIPE_TAIL(*inode);

	if (chars > count)
		chars = count;
	if (chars > size)
		chars = size;

	count -= chars;
	written = chars;

	while (chars-- > 0)
		put_fs_byte(((char *)inode->i_size)[PIPE_TAIL(*inode)++], buf++);

	PIPE_TAIL(*inode) &= (PAGE_SIZE - 1);
	PIPE_SIZE(*inode) -= written;

	wake_up(&PIPE_WRITE_WAIT(*inode));
	return written;
}

/*
 * Write to a pipe.
 */
int pipe_write(struct inode *inode, char *buf, int count)
{
	int chars, size, written;

	while (count > 0) {
		while (PIPE_FREE(*inode) == 0) {
			wake_up(&PIPE_READ_WAIT(*inode));
			if (inode->i_count < 2)
				return written ? written : -EPIPE;
			sleep_on(&PIPE_WRITE_WAIT(*inode));
		}

		size = PIPE_FREE(*inode);
		chars = PAGE_SIZE - PIPE_HEAD(*inode);

		if (chars > count)
			chars = count;
		if (chars > size)
			chars = size;

		count -= chars;
		written += chars;
		size = PIPE_HEAD(*inode);

		while (chars-- > 0)
			((char *)inode->i_size)[size++] = get_fs_byte(buf++);

		PIPE_HEAD(*inode) = size & (PAGE_SIZE - 1);
	}
	wake_up(&PIPE_READ_WAIT(*inode));
	return written;
}
