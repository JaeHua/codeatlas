/*
 * linux/fs/open.c
 *
 * (C) 1991 Linus Torvalds
 *
 * File open, close, read, write system calls.
 */

#include <linux/sched.h>
#include <linux/kernel.h>
#include <linux/fs.h>
#include <errno.h>
#include <fcntl.h>
#include <asm/system.h>
#include <asm/segment.h>

/*
 * sys_open() - open a file and return a file descriptor.
 */
int sys_open(const char * filename, int flag, int mode)
{
	struct inode *inode;
	struct file *f;
	int i, fd;

	for (fd = 0; fd < NR_OPEN; fd++)
		if (!current->filp[fd])
			break;
	if (fd >= NR_OPEN)
		return -EMFILE;

	current->close_on_exec &= ~(1 << fd);

	f = get_empty_filp();
	if (!f)
		return -ENFILE;

	current->filp[fd] = f;

	f->f_flags = flag;
	f->f_mode = (mode + 1) & O_ACCMODE;

	inode = namei(filename);
	if (!inode)
		return -ENOENT;

	if (S_ISDIR(inode->i_mode) && (f->f_mode & O_ACCMODE)) {
		iput(inode);
		return -EISDIR;
	}

	f->f_inode = inode;
	f->f_pos = 0;
	f->f_reada = 0;

	if (f->f_mode & O_TRUNC)
		truncate(inode);

	if (inode->i_op && inode->i_op->open)
		if (inode->i_op->open(inode, f))
			return -EACCES;

	return fd;
}

/*
 * sys_read() - read from a file descriptor.
 */
int sys_read(unsigned int fd, char *buf, int count)
{
	struct file *file;
	struct inode *inode;

	if (fd >= NR_OPEN || !(file = current->filp[fd]))
		return -EBADF;
	if (!(file->f_mode & 1))
		return -EBADF;
	if (!count)
		return 0;

	inode = file->f_inode;

	if (inode->i_pipe)
		return pipe_read(inode, buf, count);

	if (S_ISCHR(inode->i_mode))
		return rw_char(READ, inode->i_zone[0], buf, count);

	if (S_ISBLK(inode->i_mode))
		return block_read(inode->i_dev, buf, count, file->f_pos);

	if (S_ISDIR(inode->i_mode) || S_ISREG(inode->i_mode)) {
		if (count + file->f_pos > inode->i_size)
			count = inode->i_size - file->f_pos;
		if (count <= 0)
			return 0;
		return file_read(inode, file, buf, count);
	}

	printk("(Read)inode->i_mode=%06o\n", inode->i_mode);
	return -EINVAL;
}

/*
 * sys_write() - write to a file descriptor.
 */
int sys_write(unsigned int fd, char *buf, int count)
{
	struct file *file;
	struct inode *inode;

	if (fd >= NR_OPEN || !(file = current->filp[fd]))
		return -EBADF;
	if (!(file->f_mode & 2))
		return -EBADF;
	if (!count)
		return 0;

	inode = file->f_inode;

	if (inode->i_pipe)
		return pipe_write(inode, buf, count);

	if (S_ISCHR(inode->i_mode))
		return rw_char(WRITE, inode->i_zone[0], buf, count);

	if (S_ISBLK(inode->i_mode))
		return block_write(inode->i_dev, buf, count, file->f_pos);

	if (S_ISREG(inode->i_mode))
		return file_write(inode, file, buf, count);

	printk("(Write)inode->i_mode=%06o\n", inode->i_mode);
	return -EINVAL;
}

int sys_close(unsigned int fd)
{
	struct file *f;

	if (fd >= NR_OPEN)
		return -EBADF;

	current->close_on_exec &= ~(1 << fd);

	f = current->filp[fd];
	if (!f)
		return -EBADF;

	current->filp[fd] = NULL;

	if (f->f_count == 0)
		panic("Close: file count is 0");

	if (--f->f_count)
		return 0;

	iput(f->f_inode);
	f->f_count = 0;
	return 0;
}
