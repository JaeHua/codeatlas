/*
 * linux/include/sched.h
 *
 * (C) 1991 Linus Torvalds
 *
 * Task structure and scheduler definitions.
 */

#ifndef _SCHED_H
#define _SCHED_H

#include <linux/head.h>

#define NR_TASKS 64
#define HZ 100

#define FIRST_TSS_ENTRY 4
#define FIRST_LDT_ENTRY (FIRST_TSS_ENTRY + 1)
#define _TSS(n) ((((unsigned long)n) << 4) + (FIRST_TSS_ENTRY << 3))
#define _LDT(n) ((((unsigned long)n) << 4) + (FIRST_LDT_ENTRY << 3))

#define TASK_RUNNING		0
#define TASK_INTERRUPTIBLE	1
#define TASK_UNINTERRUPTIBLE	2
#define TASK_ZOMBIE		3
#define TASK_STOPPED		4

#ifndef NULL
#define NULL ((void *)0)
#endif

struct task_struct {
	long state;
	long counter;
	long priority;
	long signal;
	struct sigaction sigaction[32];
	long blocked;
	int exit_code;
	unsigned long start_code, end_code, end_data, brk, start_stack;
	long pid, father, pgrp, session, leader;
	unsigned short uid, euid, suid;
	unsigned short gid, egid, sgid;
	long alarm;
	long utime, stime, cutime, cstime, start_time;
	unsigned short used;
	struct tss_struct tss;
	struct desc_struct ldt[3];
	struct file *filp[NR_OPEN];
	struct inode *pwd, *root;
	struct inode *executable;
	unsigned long close_on_exec;
	struct task_struct *p_pptr, *p_cptr, *p_ysptr, *p_osptr, *p_opptr;
};

extern struct task_struct task[NR_TASKS];
extern struct task_struct *current;
extern long last_pid;
extern unsigned long volatile jiffies;

extern void schedule(void);
extern void sleep_on(struct task_struct **p);
extern void interruptible_sleep_on(struct task_struct **p);
extern void wake_up(struct task_struct **p);

extern void sched_init(void);
extern int copy_process(int nr, long ebp, long edi, long esi, long gs, long none,
			long ebx, long ecx, long edx,
			long fs, long es, long ds,
			long eip, long cs, long eflags, long esp, long ss);
extern int find_empty_process(void);
extern int do_exit(long code);
extern int sys_waitpid(pid_t pid, unsigned long *stat_addr, int options);
extern int send_sig(unsigned long signr, int pid, int uid);

#endif
