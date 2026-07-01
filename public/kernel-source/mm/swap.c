/*
 * linux/mm/swap.c
 *
 * (C) 1991 Linus Torvalds
 *
 * Swap device handling. Page-out and page-in to/from swap space.
 */

#include <linux/sched.h>
#include <linux/kernel.h>
#include <asm/system.h>
#include <errno.h>

#define SWAP_DEV 0x0200		/* major 2, minor 0 */

static struct swap_info {
	int flags;
	struct inode *swap_file;
	int swap_device;
	unsigned char *swap_map;
	unsigned char *swap_lockmap;
	int lowest_bit;
	int highest_bit;
} swap_info = {0, };

/*
 * Swap out a physical page to the swap device.
 */
void swap_out(unsigned long *table_ptr)
{
	unsigned long page;
	struct swap_info *p = &swap_info;
	int offset;

	page = *table_ptr & 0xfffff000;
	if (!page)
		return;

	offset = p->lowest_bit;
	while (offset <= p->highest_bit) {
		if (!p->swap_map[offset])
			break;
		offset++;
	}
	if (offset > p->highest_bit)
		return;

	p->swap_map[offset] = 1;

	ll_rw_page(WRITE, SWAP_DEV, offset, (char *)page);

	free_page(page);
	*table_ptr = 0;
}

/*
 * Swap in a page from the swap device.
 */
unsigned long swap_in(unsigned long *table_ptr)
{
	unsigned long page;
	int offset;

	page = get_free_page();
	if (!page)
		return 0;

	offset = *table_ptr >> PAGE_SHIFT;

	ll_rw_page(READ, SWAP_DEV, offset, (char *)page);
	p->swap_map[offset] = 0;

	*table_ptr = page | (PAGE_DIRTY | PAGE_ACCESSED | PAGE_PRESENT);
	return page;
}

/*
 * Try to swap out pages when memory is low.
 */
void try_to_swap_out(struct task_struct *tsk)
{
	unsigned long *page_dir;
	unsigned long *page_table;
	int i;

	page_dir = (unsigned long *)tsk->tss.cr3;
	if (!(page_dir[0] & 1))
		return;

	page_table = (unsigned long *)(page_dir[0] & 0xfffff000);

	for (i = 0; i < 1024; i++) {
		if (page_table[i] & PAGE_PRESENT) {
			swap_out(&page_table[i]);
			invalidate();
			return;
		}
	}
}

/*
 * Initialize the swap device.
 */
void swap_init(void)
{
	struct swap_info *p = &swap_info;

	p->swap_device = SWAP_DEV;
	p->lowest_bit = 0;
	p->highest_bit = 0x7ff;
	p->swap_map = (unsigned char *)get_free_page();

	if (!p->swap_map)
		panic("Unable to start swap");

	memset(p->swap_map, 0, PAGE_SIZE);

	printk("Swap device: %d kb\n", p->highest_bit * 4);
}
