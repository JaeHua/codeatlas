/*
 * linux/kernel/signal.c
 *
 * (C) 1991 Linus Torvalds
 *
 * Signal handling for Linux 0.21.
 */

#include <linux/sched.h>
#include <linux/kernel.h>
#include <errno.h>
#include <asm/system.h>

extern int do_signal(long signr, struct sigaction *sa);

/*
 * Send a signal to a process.
 */
int send_sig(unsigned long signr, int pid, int uid)
{
	int i;
	struct task_struct *p;

	if (signr > 32)
		return -EINVAL;

	for (i = 1; i < NR_TASKS; i++) {
		p = &task[i];
		if (!p->used)
			continue;
		if (pid > 0 && p->pid != pid)
			continue;
		if (uid && uid != p->uid && current->euid != 0)
			continue;
		p->signal |= (1 << (signr - 1));
		if (p->state == TASK_INTERRUPTIBLE)
			p->state = TASK_RUNNING;
	}
	return 0;
}

/*
 * sys_signal() - set the handler for a signal.
 */
int sys_signal(int signr, void (*handler)(int), void (*restorer)(void))
{
	struct sigaction tmp;

	if (signr < 1 || signr > 32 || signr == SIGKILL)
		return -EINVAL;

	tmp.sa_handler = handler;
	tmp.sa_mask = 0;
	tmp.sa_flags = SA_ONESHOT | SA_NOMASK;
	tmp.sa_restorer = restorer;

	*(current->sigaction + signr - 1) = tmp;
	return 0;
}

/*
 * sys_sigaction() - examine or change a signal action.
 */
int sys_sigaction(int signr, const struct sigaction *act,
		  struct sigaction *oldact)
{
	if (signr < 1 || signr > 32 || signr == SIGKILL)
		return -EINVAL;

	if (oldact)
		*oldact = current->sigaction[signr - 1];
	if (act) {
		current->sigaction[signr - 1] = *act;
		if (current->sigaction[signr - 1].sa_flags & SA_NOMASK)
			current->sigaction[signr - 1].sa_mask = 0;
	}
	return 0;
}

/*
 * sys_sigreturn() - return from a signal handler.
 */
int sys_sigreturn(void)
{
	/* Restore registers from the signal frame on the user stack */
	current->blocked = current->saved_blocked;
	return 0;
}

/*
 * sys_kill() - send a signal to a process.
 */
int sys_kill(int pid, int sig)
{
	if (pid <= 0)
		return -EINVAL;
	return send_sig((unsigned long)sig, pid, 0);
}
