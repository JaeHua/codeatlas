/*
 * linux/kernel/exit.c
 *
 * (C) 1991 Linus Torvalds
 *
 * Process exit and waitpid handling.
 */

#include <linux/sched.h>
#include <linux/kernel.h>
#include <asm/system.h>

extern void free_page_tables(unsigned long from, unsigned long size);

/*
 * Release a task's resources.
 */
static void release(struct task_struct *p)
{
	int i;

	if (!p)
		return;
	for (i = 1; i < NR_TASKS; i++)
		if (task[i].father == p->pid) {
			task[i].father = 1;
			if (task[i].state == TASK_ZOMBIE)
				release(&task[i]);
		}
	free_page_tables(p->tss.cr3, PAGE_SIZE);
	free_page((unsigned long)p->tss.esp0 - PAGE_SIZE);
	p->used = 0;
	p->pid = 0;
}

/*
 * do_exit() - the core exit function. Called by sys_exit().
 */
int do_exit(long code)
{
	int i;

	free_page_tables(current->tss.cr3, PAGE_SIZE);

	for (i = 0; i < NR_TASKS; i++)
		if (task[i].used && task[i].p_pptr == current) {
			task[i].p_pptr = task[i].p_opptr;
			task[i].p_opptr = NULL;
		}

	current->exit_code = code & 0xff;
	current->state = TASK_ZOMBIE;

	tell_father(current->father);
	schedule();
	return 0;
}

static void tell_father(int pid)
{
	int i;

	for (i = 1; i < NR_TASKS; i++)
		if (task[i].pid == pid) {
			task[i].signal |= (1 << (SIGCHLD - 1));
			return;
		}
}

/*
 * sys_waitpid() - wait for a child process to exit.
 */
int sys_waitpid(pid_t pid, unsigned long *stat_addr, int options)
{
	int flag, i;
	struct task_struct *p;

	if (pid > 0) {
		while (1) {
			for (i = 1; i < NR_TASKS; i++) {
				p = &task[i];
				if (p->father != current->pid)
					continue;
				if (p->pid != pid)
					continue;
				if (p->state == TASK_ZOMBIE) {
					put_long(p->exit_code, stat_addr);
					release(p);
					return p->pid;
				}
				break;
			}
			if (options & WNOHANG)
				return 0;
			current->state = TASK_INTERRUPTIBLE;
			schedule();
			if (current->signal & ~current->blocked)
				return -EINTR;
		}
	}
	return -ECHILD;
}

int sys_exit(int exit_code)
{
	return do_exit(exit_code);
}
