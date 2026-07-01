/*
 * linux/fs/buffer.c
 *
 * (C) 1991 Linus Torvalds
 *
 * Buffer cache management: read blocks (bread), release buffers (brelse),
 * and get a buffer block (getblk).
 */

#include <linux/sched.h>
#include <linux/kernel.h>
#include <linux/fs.h>
#include <asm/system.h>

/*
 * Get a free buffer block from the hash table.
 */
struct buffer_head *getblk(int dev, int block)
{
	struct buffer_head *bh;

	bh = get_hash_table(dev, block);
	if (bh) {
		bh->b_count++;
		return bh;
	}

	bh = get_free_buffer();
	if (!bh) {
		sleep_on(&buffer_wait);
		goto repeat;
	}

	bh->b_dev = dev;
	bh->b_blocknr = block;
	bh->b_count = 1;
	bh->b_dirt = 0;
	bh->b_uptodate = 0;

	remove_from_queues(bh);
	insert_into_queues(bh);

	return bh;
}

/*
 * Read a block from disk into the buffer cache.
 */
struct buffer_head *bread(int dev, int block)
{
	struct buffer_head *bh;

	bh = getblk(dev, block);
	if (bh->b_uptodate)
		return bh;

	ll_rw_block(READ, bh);
	wait_on_buffer(bh);

	if (bh->b_uptodate)
		return bh;

	brelse(bh);
	return NULL;
}

/*
 * Release a buffer head (decrement reference count).
 */
void brelse(struct buffer_head *buf)
{
	if (!buf)
		return;

	wait_on_buffer(buf);

	if (!buf->b_count)
		panic("brelse: buffer count < 0");

	buf->b_count--;

	if (!buf->b_count)
		wake_up(&buffer_wait);
}

/*
 * Mark a buffer as dirty (needs to be written to disk).
 */
void bwrite(struct buffer_head *buf)
{
	if (!buf)
		return;

	buf->b_dirt = 1;
}

/*
 * Sync all dirty buffers to disk.
 */
void sync_buffers(int dev)
{
	struct buffer_head *bh;
	int i;

	for (i = 0; i < NR_BUFFERS; i++) {
		bh = &buffer_heads[i];
		if (bh->b_dev == dev && bh->b_dirt) {
			ll_rw_block(WRITE, bh);
			wait_on_buffer(bh);
		}
	}
}

/*
 * Invalidate all buffers for a given device.
 */
void invalidate_buffers(int dev)
{
	struct buffer_head *bh;
	int i;

	for (i = 0; i < NR_BUFFERS; i++) {
		bh = &buffer_heads[i];
		if (bh->b_dev == dev) {
			if (bh->b_count)
				printk("invalidate: buffer still in use\n");
			bh->b_uptodate = 0;
			bh->b_dirt = 0;
		}
	}
}
