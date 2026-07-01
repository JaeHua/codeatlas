/*
 * linux/fs/super.c
 *
 * (C) 1991 Linus Torvalds
 *
 * Super-block management: mount, umount, and super-block operations.
 */

#include <linux/sched.h>
#include <linux/kernel.h>
#include <linux/fs.h>
#include <errno.h>
#include <asm/system.h>

struct super_block super_blocks[NR_SUPER];

/*
 * Get the super block for a given device.
 */
struct super_block *get_super(int dev)
{
	struct super_block *s;

	s = super_blocks;
	while (s < NR_SUPER + super_blocks) {
		if (s->s_dev == dev && s->s_covered)
			return s;
		s++;
	}
	return NULL;
}

/*
 * Free a super-block entry.
 */
static void put_super(int dev)
{
	struct super_block *sb;
	int i;

	sb = get_super(dev);
	if (!sb)
		return;

	if (sb->s_covered)
		iput(sb->s_covered);

	for (i = 0; i < I_MAP_SLOTS; i++)
		brelse(sb->s_imap[i]);
	for (i = 0; i < Z_MAP_SLOTS; i++)
		brelse(sb->s_zmap[i]);
}

/*
 * Read the super block from disk.
 */
static struct super_block *read_super(int dev)
{
	struct super_block *s;
	struct buffer_head *bh;
	int i, block;

	s = super_blocks;
	while (s < NR_SUPER + super_blocks) {
		if (!s->s_dev)
			break;
		s++;
	}
	if (s >= NR_SUPER + super_blocks)
		return NULL;

	bh = bread(dev, 1);
	if (!bh) {
		s->s_dev = 0;
		return NULL;
	}

	*((struct d_super_block *)s) =
		*((struct d_super_block *)bh->b_data);

	brelse(bh);

	if (s->s_magic != SUPER_MAGIC) {
		s->s_dev = 0;
		return NULL;
	}

	s->s_dev = dev;
	s->s_imap_blocks = (s->s_ninodes + BLOCK_SIZE * 8 - 1) / (BLOCK_SIZE * 8);
	s->s_zmap_blocks = (s->s_nzones + BLOCK_SIZE * 8 - 1) / (BLOCK_SIZE * 8);

	block = 2;
	for (i = 0; i < s->s_imap_blocks; i++) {
		s->s_imap[i] = bread(dev, block);
		if (!s->s_imap[i])
			panic("Unable to read inode bitmap");
		block++;
	}
	for (i = 0; i < s->s_zmap_blocks; i++) {
		s->s_zmap[i] = bread(dev, block);
		if (!s->s_zmap[i])
			panic("Unable to read zone bitmap");
		block++;
	}

	s->s_covered = NULL;
	s->s_mounted = NULL;

	return s;
}

/*
 * Mount a filesystem.
 */
int sys_mount(char *dev_name, char *dir_name, int rw_flag)
{
	struct inode *dev_i, *dir_i;
	struct super_block *sb;
	int dev;

	dev_i = namei(dev_name);
	if (!dev_i)
		return -ENOENT;

	dev = dev_i->i_zone[0];
	if (!S_ISBLK(dev_i->i_mode)) {
		iput(dev_i);
		return -EPERM;
	}
	iput(dev_i);

	dir_i = namei(dir_name);
	if (!dir_i)
		return -ENOENT;

	if (!S_ISDIR(dir_i->i_mode) || dir_i->i_count > 1) {
		iput(dir_i);
		return -EBUSY;
	}

	sb = read_super(dev);
	if (!sb) {
		iput(dir_i);
		return -EBUSY;
	}

	if (sb->s_covered) {
		iput(dir_i);
		return -EBUSY;
	}

	if (dir_i->i_dev != ROOT_DEV && dir_i == current->root) {
		iput(dir_i);
		return -EBUSY;
	}

	sb->s_covered = dir_i;
	sb->s_mounted = iget(dev, 1);

	return 0;
}

/*
 * Unmount a filesystem.
 */
int sys_umount(char *dev_name)
{
	struct inode *inode;
	struct super_block *sb;
	int dev;

	inode = namei(dev_name);
	if (!inode)
		return -ENOENT;

	dev = inode->i_zone[0];
	iput(inode);

	if (dev == ROOT_DEV)
		return -EACCES;

	sb = get_super(dev);
	if (!sb || !sb->s_covered)
		return -ENOENT;

	if (sb->s_covered->i_count > 1)
		return -EBUSY;

	if (sb->s_mounted && sb->s_mounted->i_count > 1)
		return -EBUSY;

	put_super(dev);
	sync_dev(dev);

	sb->s_dev = 0;
	return 0;
}
