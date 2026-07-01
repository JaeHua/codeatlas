/*
 * linux/fs/namei.c
 *
 * (C) 1991 Linus Torvalds
 *
 * Pathname resolution: namei(), open_namei(), dir_namei().
 */

#include <linux/sched.h>
#include <linux/kernel.h>
#include <linux/fs.h>
#include <errno.h>
#include <asm/system.h>
#include <asm/segment.h>

/*
 * Resolve a pathname to an inode.
 * This is the core path lookup function.
 */
struct inode *namei(const char *pathname)
{
	struct inode *inode;
	char c;
	const char *thisname;
	int namelen;

	if (!pathname || !*pathname)
		return NULL;

	/* Start from root or current working directory */
	if (*pathname == '/')
		inode = current->root;
	else
		inode = current->pwd;

	inode->i_count++;

	while (1) {
		while (*pathname == '/')
			pathname++;
		if (!*pathname)
			break;

		thisname = pathname;
		namelen = 0;
		while ((c = *(pathname++)) && c != '/')
			namelen++;

		if (!S_ISDIR(inode->i_mode)) {
			iput(inode);
			return NULL;
		}

		inode = lookup(inode, thisname, namelen);
		if (!inode)
			return NULL;

		/* Handle symbolic links */
		if (S_ISLNK(inode->i_mode)) {
			/* follow the symlink (simplified) */
			if (inode->i_op && inode->i_op->follow_link)
				inode = inode->i_op->follow_link(inode);
		}
	}
	return inode;
}

/*
 * Look up a directory entry in a directory inode.
 */
struct inode *lookup(struct inode *dir, const char *name, int len)
{
	struct buffer_head *bh;
	struct dir_entry *de;
	int i, block;

	if (!dir)
		return NULL;

	if (!S_ISDIR(dir->i_mode)) {
		iput(dir);
		return NULL;
	}

	if (!len && name)
		return dir;

	/* Iterate through directory blocks */
	for (block = 0; block < dir->i_size; block += BLOCK_SIZE) {
		bh = bread(dir->i_dev, dir->i_zone[block / BLOCK_SIZE]);
		if (!bh)
			continue;

		de = (struct dir_entry *)bh->b_data;
		for (i = 0; i < BLOCK_SIZE; i += sizeof(struct dir_entry), de++) {
			if (!de->inode)
				continue;
			if (match(len, name, de->name))
				return iget(dir->i_dev, de->inode);
		}
		brelse(bh);
	}
	return NULL;
}

/*
 * Match a name with a directory entry name.
 */
static int match(int len, const char *name, const char *de_name)
{
	int i;

	for (i = 0; i < NAME_LEN; i++) {
		if (!len)
			return !de_name[i];
		if (name[i] != de_name[i])
			return 0;
		len--;
	}
	return 1;
}

/*
 * Open a pathname for reading/writing.
 */
int open_namei(const char *pathname, int flag, int mode,
	       struct inode **res_inode)
{
	struct inode *inode;

	inode = namei(pathname);
	if (!inode) {
		if (flag & O_CREAT)
			return -ENOENT;
		return -ENOENT;
	}

	*res_inode = inode;
	return 0;
}
