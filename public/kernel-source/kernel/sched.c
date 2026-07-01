/*
 * linux/kernel/sched.c
 *
 * (C) 1991 Linus Torvalds
 *
 * 'sched.c' is the main kernel scheduler. It contains the primitive
 * functions for process scheduling: sleep_on(), wake_up(), schedule(), etc.
 */

#include <linux/sched.h>
#include <linux/kernel.h>
#include <asm/system.h>
#include <asm/io.h>

extern void switch_to(struct task_struct *next);

/*
 * schedule() is the main scheduler function.
 * It finds the next runnable task and switches to it.
 */
void schedule(void)
{
	int i, next, c;
	struct task_struct *p;

	while (1) {
		c = -1;
		next = 0;
		for (i = NR_TASKS; --i >= 0;) {
			p = &task[i];
			if (p->state == TASK_RUNNING && p->counter > c) {
				c = p->counter;
				next = i;
			}
		}
		if (c)
			break;
		for (i = NR_TASKS; --i >= 0;) {
			p = &task[i];
			p->counter = (p->counter >> 1) + p->priority;
		}
	}
	switch_to(&task[next]);
}

/*
 * Put the current task to sleep on the given wait queue.
 */
void sleep_on(struct task_struct **p)
{
	struct task_struct *tmp;

	if (!p)
		return;
	if (current == &(task[0]))
		panic("task[0] trying to sleep");
	tmp = *p;
	*p = current;
	current->state = TASK_UNINTERRUPTIBLE;
	schedule();
	*p = tmp;
	if (tmp)
		tmp->state = TASK_RUNNING;
}

void interruptible_sleep_on(struct task_struct **p)
{
	struct task_struct *tmp;

	if (!p)
		return;
	if (current == &(task[0]))
		panic("task[0] trying to sleep");
	tmp = *p;
	*p = current;
	current->state = TASK_INTERRUPTIBLE;
	schedule();
	*p = tmp;
	if (tmp)
		tmp->state = TASK_RUNNING;
}

void wake_up(struct task_struct **p)
{
	if (p && *p) {
		(*p)->state = TASK_RUNNING;
		*p = NULL;
	}
}
