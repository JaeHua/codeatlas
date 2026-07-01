/*
 * linux/include/fs.h
 *
 * (C) 1991 Linus Torvalds
 *
 * Filesystem type definitions and structures.
 */

#ifndef _FS_H
#define _FS_H

#include <linux/sched.h>

#define NR_OPEN 20
#define NR_FILE 64
#define NR_INODE 64
#define NR_SUPER 8
#define NR_BUFFERS 3072
#define BLOCK_SIZE 1024
#define BLOCK_SIZE_BITS 10
#define NAME_LEN 14

#define READ 0
#define WRITE 1

#define SUPER_MAGIC 0x137F

#define INODES_PER_BLOCK ((BLOCK_SIZE) / (sizeof(struct d_inode)))

#define I_MAP_SLOTS 8
#define Z_MAP_SLOTS 8

#define MAY_EXEC 1
#define MAY_WRITE 2
#define MAY_READ 4

/* File types */
#define S_IFMT  00170000
#define S_IFREG 0100000
#define S_IFBLK 0060000
#define S_IFDIR 0040000
#define S_IFCHR 0020000
#define S_IFIFO 0010000
#define S_ISUID 0004000
#define S_ISGID 0002000
#define S_ISVTX 0001000

#define S_ISREG(m) (((m) & S_IFMT) == S_IFREG)
#define S_ISDIR(m) (((m) & S_IFMT) == S_IFDIR)
#define S_ISCHR(m) (((m) & S_IFMT) == S_IFCHR)
#define S_ISBLK(m) (((m) & S_IFMT) == S_IFBLK)
#define S_ISFIFO(m) (((m) & S_IFMT) == S_IFIFO)
#define S_ISLNK(m) (((m) & S_IFMT) == 0120000)

#define PIPE_HEAD(inode) ((inode).i_zone[0])
#define PIPE_TAIL(inode) ((inode).i_zone[1])
#define PIPE_SIZE(inode) ((inode).i_size)
#define PIPE_FREE(inode) (PAGE_SIZE - PIPE_SIZE(inode))
#define PIPE_READ_WAIT(inode) ((inode).i_wait)
#define PIPE_WRITE_WAIT(inode) ((inode).i_wait2)

struct buffer_head {
	char *b_data;
	unsigned long b_blocknr;
	unsigned short b_dev;
	unsigned char b_uptodate;
	unsigned char b_dirt;
	unsigned char b_count;
	unsigned char b_lock;
	struct task_struct *b_wait;
	struct buffer_head *b_prev;
	struct buffer_head *b_next;
	struct buffer_head *b_prev_free;
	struct buffer_head *b_next_free;
};

struct d_inode {
	unsigned short i_mode;
	unsigned short i_uid;
	unsigned long i_size;
	unsigned long i_time;
	unsigned char i_gid;
	unsigned char i_nlinks;
	unsigned short i_zone[9];
};

struct inode {
	unsigned short i_mode;
	unsigned short i_uid;
	unsigned long i_size;
	unsigned long i_time;
	unsigned char i_gid;
	unsigned char i_nlinks;
	unsigned short i_zone[9];
	unsigned short i_dev;
	unsigned short i_ino;
	unsigned short i_count;
	unsigned char i_lock;
	unsigned char i_dirt;
	unsigned char i_pipe;
	unsigned char i_sock;
	unsigned char i_seek;
	unsigned char i_update;
	unsigned char i_wait, i_wait2;
	struct inode_operations *i_op;
};

struct file {
	unsigned short f_mode;
	unsigned short f_flags;
	unsigned short f_count;
	struct inode *f_inode;
	unsigned long f_pos;
	unsigned long f_reada;
};

struct super_block {
	unsigned short s_ninodes;
	unsigned short s_nzones;
	unsigned short s_imap_blocks;
	unsigned short s_zmap_blocks;
	unsigned short s_firstdatazone;
	unsigned short s_log_zone_size;
	unsigned long s_max_size;
	unsigned short s_magic;
	struct buffer_head *s_imap[I_MAP_SLOTS];
	struct buffer_head *s_zmap[Z_MAP_SLOTS];
	unsigned short s_dev;
	struct inode *s_covered;
	struct inode *s_mounted;
};

struct d_super_block {
	unsigned short s_ninodes;
	unsigned short s_nzones;
	unsigned short s_imap_blocks;
	unsigned short s_zmap_blocks;
	unsigned short s_firstdatazone;
	unsigned short s_log_zone_size;
	unsigned long s_max_size;
	unsigned short s_magic;
};

struct dir_entry {
	unsigned short inode;
	char name[NAME_LEN];
};

extern struct buffer_head buffer_heads[NR_BUFFERS];
extern struct buffer_head *buffer_wait;

extern struct buffer_head *getblk(int dev, int block);
extern struct buffer_head *bread(int dev, int block);
extern void brelse(struct buffer_head *buf);
extern void bwrite(struct buffer_head *buf);
extern void sync_buffers(int dev);
extern void invalidate_buffers(int dev);
extern void buffer_init(long buffer_end);

extern struct inode *namei(const char *pathname);
extern struct inode *iget(int dev, int nr);
extern void iput(struct inode *inode);
extern struct inode *get_pipe_inode(void);
extern struct super_block *get_super(int dev);
extern void wait_on_inode(struct inode *inode);

extern int sys_open(const char *filename, int flag, int mode);
extern int sys_read(unsigned int fd, char *buf, int count);
extern int sys_write(unsigned int fd, char *buf, int count);
extern int sys_close(unsigned int fd);
extern int sys_pipe(unsigned long *fildes);
extern int sys_creat(const char *pathname, int mode);

extern int block_read(int dev, char *buf, int count, unsigned long pos);
extern int block_write(int dev, char *buf, int count, unsigned long pos);
extern int file_read(struct inode *inode, struct file *filp, char *buf, int count);
extern int file_write(struct inode *inode, struct file *filp, char *buf, int count);

#endif
