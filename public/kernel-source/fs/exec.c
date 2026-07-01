/*
 * linux/fs/exec.c
 *
 * (C) 1991 Linus Torvalds
 *
 * execve() system call implementation.
 */

#include <linux/sched.h>
#include <linux/kernel.h>
#include <linux/fs.h>
#include <a.out.h>
#include <errno.h>
#include <fcntl.h>
#include <asm/system.h>
#include <asm/segment.h>

extern int sys_close(int fd);

/*
 * Load and execute a binary.
 */
int do_execve(unsigned long *eip, unsigned long *esp,
	      struct pt_regs *regs)
{
	struct exec ex;
	struct inode *inode;
	struct file *file;
	unsigned long page[4];
	int i;

	inode = namei((char *)eip[1]);
	if (!inode)
		return -ENOENT;

	if (!S_ISREG(inode->i_mode)) {
		iput(inode);
		return -EACCES;
	}

	if (!(inode->i_mode & 0111)) {
		iput(inode);
		return -ENOEXEC;
	}

	file = open_filp(inode, 0);
	if (!file) {
		iput(inode);
		return -ENOEXEC;
	}

	if (file->f_op && file->f_op->read)
		file->f_op->read(inode, file, (char *)&ex, sizeof(ex));
	else
		file_read(inode, file, (char *)&ex, sizeof(ex));

	if (N_MAGIC(ex) != ZMAGIC || ex.a_trsize || ex.a_drsize || ex.a_text == 0) {
		iput(inode);
		return -ENOEXEC;
	}

	for (i = 0; i < 4; i++)
		page[i] = get_free_page();

	if (!page[3]) {
		for (i = 0; i < 4; i++)
			free_page(page[i]);
		iput(inode);
		return -ENOMEM;
	}

	current->executable = inode;

	change_ldt(ex.a_text, page);

	eip[0] = ex.a_entry;
	eip[1] = 0;
	*esp = ex.a_bss + ex.a_data + ex.a_text;

	sys_close(0);
	sys_close(1);
	sys_close(2);

	return 0;
}

/*
 * sys_execve() - the actual system call entry point.
 */
int sys_execve(char *filename, char **argv, char **envp)
{
	unsigned long eip[2];
	struct pt_regs *regs;

	eip[0] = 0x23;	/* user CS */
	eip[1] = (unsigned long)filename;

	regs = (struct pt_regs *)&eip;
	return do_execve(eip, (unsigned long *)regs, regs);
}
