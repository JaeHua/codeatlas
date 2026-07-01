/*
 * linux/kernel/fork.c
 *
 * (C) 1991 Linus Torvalds
 *
 * 'fork.c' contains the help-routines for the 'fork' system call
 * and the 'copy_process()' function for creating new processes.
 */

#include <linux/sched.h>
#include <linux/kernel.h>
#include <asm/system.h>
#include <errno.h>

extern void copy_page_tables(unsigned long from, unsigned long to, long size);
extern int copy_mem(int nr, struct task_struct *p);

/*
 * Find an empty task slot in the task array.
 */
int find_empty_process(void)
{
	int i;

	for (i = 1; i < NR_TASKS; i++)
		if (!task[i].used) {
			task[i].used = 1;
			return i;
		}
	return -EAGAIN;
}

/*
 * Copy a process - the core of fork().
 */
int copy_process(int nr, long ebp, long edi, long esi, long gs, long none,
		long ebx, long ecx, long edx,
		long fs, long es, long ds,
		long eip, long cs, long eflags, long esp, long ss)
{
	struct task_struct *p;
	int i;
	unsigned long new_page;

	p = &task[nr];
	*p = *current;	/* copy the whole task struct */

	p->pid = last_pid;
	p->father = current->pid;
	p->counter = p->priority;
	p->alarm = 0;
	p->signal = 0;
	p->leader = 0;
	p->utime = p->stime = 0;
	p->cutime = p->cstime = 0;
	p->start_time = jiffies;

	new_page = get_free_page();
	if (!new_page)
		return -ENOMEM;

	p->tss.esp0 = new_page + PAGE_SIZE;
	p->tss.ss0 = 0x10;

	set_tss_desc(gdt + (nr << 1) + FIRST_TSS_ENTRY, &(p->tss));
	set_ldt_desc(gdt + (nr << 1) + FIRST_LDT_ENTRY, &(p->ldt));

	p->state = TASK_RUNNING;
	p->tss.eip = eip;
	p->tss.eflags = eflags;
	p->tss.eax = 0;
	p->tss.ecx = ecx;
	p->tss.edx = edx;
	p->tss.ebx = ebx;
	p->tss.esp = esp;
	p->tss.ebp = ebp;
	p->tss.esi = esi;
	p->tss.edi = edi;
	p->tss.es = es & 0xffff;
	p->tss.cs = cs & 0xffff;
	p->tss.ss = ss & 0xffff;
	p->tss.ds = ds & 0xffff;
	p->tss.fs = fs & 0xffff;
	p->tss.gs = gs & 0xffff;

	if (copy_mem(nr, p)) {
		free_page(new_page);
		task[nr].used = 0;
		return -ENOMEM;
	}
	return last_pid;
}

/*
 * fork() system call entry point.
 */
int sys_fork(void)
{
	return copy_process(find_empty_process(),
			    __builtin_frame_address(0) + 12,
			    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
}
