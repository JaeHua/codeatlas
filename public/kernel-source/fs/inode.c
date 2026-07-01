/*
 * linux/fs/inode.c
 *
 * (C) 1991 Linus Torvalds
 *
 * Inode management: allocation, deallocation, reading, writing.
 */

#include <linux/sched.h>
#include <linux/kernel.h>
#include <linux/fs.h>
#include <errno.h>
#include <asm/system.h>

struct inode inodes[NR_INODE] = {{0, }, };

/*
 * Get an inode from the inode cache by device and inode number.
 */
struct inode *iget(int dev, int nr)
{
	struct inode *inode, *empty;

	empty = NULL;
	inode = inodes;

	while (inode < NR_INODE + inodes) {
		if (inode->i_dev != dev || inode->i_ino != nr) {
			if (!empty && !inode->i_dev)
				empty = inode;
			inode++;
			continue;
		}
		wait_on_inode(inode);
		inode->i_count++;
		return inode;
	}

	if (!empty)
		return NULL;

	inode = empty;
	inode->i_dev = dev;
	inode->i_ino = nr;
	inode->i_count = 1;
	inode->i_dirt = 0;
	inode->i_pipe = 0;
	inode->i_sock = 0;
	inode->i_seek = 0;
	inode->i_update = 0;

	read_inode(inode);

	return inode;
}

/*
 * Release an inode (decrement reference count).
 */
void iput(struct inode *inode)
{
	if (!inode)
		return;

	wait_on_inode(inode);

	if (!inode->i_count)
		panic("iput: trying to free free inode");

	inode->i_count--;

	if (inode->i_count)
		return;

	if (inode->i_pipe) {
		wake_up(&inode->i_wait);
		wake_up(&inode->i_wait2);
		return;
	}

	if (S_ISBLK(inode->i_mode)) {
		sync_dev(inode->i_zone[0]);
		inode->i_dirt = 0;
	}

	if (inode->i_dirt || inode->i_nlinks == 0) {
		if (inode->i_nlinks == 0) {
			free_block(inode->i_dev, inode->i_zone[0]);
			inode->i_zone[0] = 0;
		}
		write_inode(inode);
	}

	inode->i_dev = 0;
	inode->i_ino = 0;
}

/*
 * Read an inode from disk.
 */
static void read_inode(struct inode *inode)
{
	struct super_block *sb;
	struct buffer_head *bh;
	int block;

	lock_inode(inode);

	sb = get_super(inode->i_dev);

	block = 2 + sb->s_imap_blocks + sb->s_zmap_blocks;
	block += (inode->i_ino - 1) / INODES_PER_BLOCK;

	bh = bread(inode->i_dev, block);
	if (!bh)
		panic("unable to read inode block");

	*(struct d_inode *)inode =
		((struct d_inode *)bh->b_data)[(inode->i_ino - 1) % INODES_PER_BLOCK];

	brelse(bh);
	unlock_inode(inode);
}

/*
 * Write an inode back to disk.
 */
static void write_inode(struct inode *inode)
{
	struct super_block *sb;
	struct buffer_head *bh;
	int block;

	lock_inode(inode);

	sb = get_super(inode->i_dev);

	block = 2 + sb->s_imap_blocks + sb->s_zmap_blocks;
	block += (inode->i_ino - 1) / INODES_PER_BLOCK;

	bh = bread(inode->i_dev, block);
	if (!bh)
		panic("unable to read inode block");

	((struct d_inode *)bh->b_data)[(inode->i_ino - 1) % INODES_PER_BLOCK] =
		*(struct d_inode *)inode;

	bh->b_dirt = 1;
	brelse(bh);
	unlock_inode(inode);
}

/*
 * Wait on an inode that's being read/written.
 */
void wait_on_inode(struct inode *inode)
{
	while (inode->i_lock) {
		inode->i_wait2 = current;
		sleep_on(&inode->i_wait);
	}
}
