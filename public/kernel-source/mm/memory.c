/*
 * linux/mm/memory.c
 *
 * (C) 1991 Linus Torvalds
 *
 * Low-level page management: page allocation, freeing,
 * and page table manipulation.
 */

#include <linux/sched.h>
#include <linux/kernel.h>
#include <asm/system.h>
#include <errno.h>

#define LOW_MEM 0x100000

unsigned long HIGH_MEMORY = 0;

static unsigned char mem_map[PAGING_PAGES] = {0, };

/*
 * Get a free physical page.
 */
unsigned long get_free_page(void)
{
	int i;

	for (i = 0; i < PAGING_PAGES; i++) {
		if (!mem_map[i]) {
			mem_map[i] = 1;
			return LOW_MEM + (i * PAGE_SIZE);
		}
	}
	return 0;
}

/*
 * Free a physical page.
 */
void free_page(unsigned long addr)
{
	unsigned long index;

	addr -= LOW_MEM;
	addr >>= 12;	/* div by PAGE_SIZE */

	if (addr >= PAGING_PAGES)
		panic("trying to free nonexistent page");

	if (!mem_map[addr])
		panic("trying to free free page");

	mem_map[addr] = 0;
}

/*
 * Show available memory statistics.
 */
unsigned long get_free_pages(void)
{
	unsigned long count = 0;
	int i;

	for (i = 0; i < PAGING_PAGES; i++)
		if (!mem_map[i])
			count++;
	return count * PAGE_SIZE;
}

/*
 * Initialize the memory manager.
 */
void mem_init(long start_mem, long end_mem)
{
	int i;

	HIGH_MEMORY = end_mem;

	for (i = 0; i < PAGING_PAGES; i++)
		mem_map[i] = USED;

	i = MAP_NR(start_mem);
	while (start_mem < end_mem) {
		mem_map[i++] = 0;
		start_mem += PAGE_SIZE;
	}
}

/*
 * Copy page tables for fork().
 */
void copy_page_tables(unsigned long from, unsigned long to, long size)
{
	unsigned long *from_dir, *to_dir;
	unsigned long *from_page_table, *to_page_table;
	unsigned long this_page;
	unsigned long nr;

	from_dir = (unsigned long *)from;
	to_dir = (unsigned long *)to;
	size = ((unsigned long)(size + 0x3fffff)) >> 22;

	for (; size-- > 0; from_dir++, to_dir++) {
		if (1 & *from_dir) {
			from_page_table = (unsigned long *)(0xfffff000 & *from_dir);
			to_page_table = (unsigned long *)get_free_page();
			if (!to_page_table)
				return;
			*to_dir = ((unsigned long)to_page_table) | 7;
			nr = 1024;
			while (nr-- > 0) {
				this_page = *from_page_table;
				if (1 & this_page) {
					*from_page_table = this_page & ~2;
					*to_page_table = this_page;
				}
				from_page_table++;
				to_page_table++;
			}
		}
	}
	invalidate();
}
