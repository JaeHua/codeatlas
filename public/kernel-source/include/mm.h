/*
 * linux/include/mm.h
 *
 * (C) 1991 Linus Torvalds
 *
 * Memory management definitions.
 */

#ifndef _MM_H
#define _MM_H

#define PAGE_SIZE 4096
#define PAGE_SHIFT 12

#define PAGING_PAGES (15 * 256)
#define MAP_NR(addr) (((addr) - LOW_MEM) >> PAGE_SHIFT)

#define PAGE_PRESENT	0x001
#define PAGE_RW		0x002
#define PAGE_USER	0x004
#define PAGE_ACCESSED	0x020
#define PAGE_DIRTY	0x040

extern unsigned long HIGH_MEMORY;

extern unsigned long get_free_page(void);
extern void free_page(unsigned long addr);
extern unsigned long get_free_pages(void);
extern void mem_init(long start_mem, long end_mem);
extern void copy_page_tables(unsigned long from, unsigned long to, long size);
extern void free_page_tables(unsigned long from, unsigned long size);
extern int copy_mem(int nr, struct task_struct *p);
extern void invalidate(void);

extern void swap_out(unsigned long *table_ptr);
extern unsigned long swap_in(unsigned long *table_ptr);
extern void try_to_swap_out(struct task_struct *tsk);
extern void swap_init(void);

extern void ll_rw_block(int rw, struct buffer_head *bh);
extern void ll_rw_page(int rw, int dev, int page, char *buf);

#endif
