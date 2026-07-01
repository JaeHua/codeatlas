/*
 * linux/init/main.c
 *
 * (C) 1991 Linus Torvalds
 *
 * Kernel initialization and main entry point.
 */

#include <linux/sched.h>
#include <linux/kernel.h>
#include <linux/tty.h>
#include <asm/system.h>
#include <asm/io.h>

static long memory_end = 0;
static long buffer_memory_end = 0;
static long main_memory_start = 0;

struct drive_info { char dummy[32]; } drive_info;

extern void hd_init(void);
extern void mem_init(long start_mem, long end_mem);
extern void trap_init(void);
extern void blk_dev_init(void);
extern void chr_dev_init(void);
extern void tty_init(void);
extern void time_init(void);
extern void sched_init(void);
extern void buffer_init(long buffer_end);
extern void fs_init(void);

/*
 * Kernel entry point. Called from head.S after protected mode setup.
 */
void main(void)
{
	ROOT_DEV = ORIG_ROOT_DEV;

	drive_info = DRIVE_INFO;

	memory_end = (1 << 20) + (EXT_MEM_K << 10);
	memory_end &= 0xfffff000;

	if (memory_end > 16 * 1024 * 1024)
		memory_end = 16 * 1024 * 1024;

	buffer_memory_end = 4 * 1024 * 1024;
	main_memory_start = buffer_memory_end;

	mem_init(main_memory_start, memory_end);
	trap_init();
	blk_dev_init();
	chr_dev_init();
	tty_init();
	time_init();
	sched_init();
	buffer_init(buffer_memory_end);
	hd_init();
	sti();
	move_to_user_mode();
	init();
}

/*
 * init() runs as process 1. It sets up the initial environment
 * and spawns a shell.
 */
void init(void)
{
	int pid;
	int i;

	setup();
	if (!fork()) {
		init();
	}

	for (i = 0; i < 3; i++) {
		if (!fork()) {
			close(i);
			open("/dev/tty0", O_RDWR, 0);
			dup(0);
			dup(0);
			break;
		}
	}

	for (;;) {
		pid = wait();
		printk("child %d died with code %04x\n", pid);
	}
}

static void setup(void)
{
	struct stat statbuf;

	(void) open("/dev/tty0", O_RDWR, 0);
	(void) dup(0);
	(void) dup(0);

	printk("Linux version 0.21\n");
}

/*
 * System call table placeholder.
 */
fn_ptr sys_call_table[] = {
	sys_setup, sys_exit, sys_fork, sys_read,
	sys_write, sys_open, sys_close, sys_waitpid,
	sys_creat, sys_link, sys_unlink, sys_execve,
	sys_chdir, sys_time, sys_mknod, sys_chmod,
	sys_chown, sys_break, sys_stat, sys_lseek,
	sys_getpid, sys_mount, sys_umount, sys_setuid,
	sys_getuid, sys_stime, sys_ptrace, sys_alarm,
	sys_fstat, sys_pause, sys_utime, sys_stty,
	sys_gtty, sys_access, sys_nice, sys_ftime,
	sys_sync, sys_kill, sys_rename, sys_mkdir,
	sys_rmdir, sys_dup, sys_pipe, sys_times,
	sys_brk, sys_setgid, sys_getgid, sys_signal,
	sys_geteuid, sys_getegid, sys_acct, sys_phys,
	sys_lock, sys_ioctl, sys_fcntl, sys_mpx,
	sys_setpgid, sys_ulimit, NULL, NULL,
	sys_umask, sys_chroot, sys_dup2, sys_getppid,
	sys_getpgrp, sys_setsid, sys_sigaction,
};
