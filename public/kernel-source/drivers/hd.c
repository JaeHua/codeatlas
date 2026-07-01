/*
 * linux/drivers/hd.c
 *
 * (C) 1991 Linus Torvalds
 *
 * Hard disk driver. Handles IDE/ATA disk I/O through the
 * block device interface with interrupt-driven transfers.
 */

#include <linux/sched.h>
#include <linux/kernel.h>
#include <linux/fs.h>
#include <linux/hdreg.h>
#include <errno.h>
#include <asm/system.h>
#include <asm/io.h>

#define MAJOR_NR 3
#define DEVICE_NAME "harddisk"
#define DEVICE_REQUEST do_hd_request

#define HD_DATA		0x1f0
#define HD_ERROR	0x1f1
#define HD_PRECOMP	0x1f1
#define HD_SECCOUNT	0x1f2
#define HD_SECTOR	0x1f3
#define HD_LCYL		0x1f4
#define HD_HCYL		0x1f5
#define HD_CURRENT	0x1f6
#define HD_STATUS	0x1f7
#define HD_CMD		0x1f7

#define ERR_STAT	0x01
#define INDEX_STAT	0x02
#define ECC_STAT	0x04
#define DRQ_STAT	0x08
#define SEEK_STAT	0x10
#define WRERR_STAT	0x20
#define READY_STAT	0x40
#define BUSY_STAT	0x80

#define WIN_READ	0x20
#define WIN_WRITE	0x30

static int recalibrate = 0;
static int reset = 0;

/*
 * Lock for HD controller access.
 */
static void lock_hd(void)
{
	while (hd_status & BUSY_STAT)
		;
}

/*
 * Do an HD request from the block device queue.
 */
static void do_hd_request(void)
{
	unsigned int dev, head, sect, cyl, nsect, cmd;
	unsigned int block;

	lock_hd();

	dev = CURRENT_DEV;
	if (dev >= 5 * NR_HD) {
		end_request(0);
		return;
	}
	block = CURRENT->sector;
	nsect = CURRENT->nr_sectors;
	if (nsect <= 0 || block + nsect > hd[dev].nr_sects) {
		end_request(0);
		return;
	}
	block += hd[dev].start_sect;
	dev /= 5;

	cyl = block / (hd[dev].head * hd[dev].sect);
	head = (block % (hd[dev].head * hd[dev].sect)) / hd[dev].sect;
	sect = (block % hd[dev].sect) + 1;

	if (CURRENT->cmd == WRITE) {
		cmd = WIN_WRITE;
		hd_out(dev, nsect, sect, head, cyl, WIN_WRITE);
	} else if (CURRENT->cmd == READ) {
		cmd = WIN_READ;
		hd_out(dev, nsect, sect, head, cyl, WIN_READ);
	} else
		panic("unknown hd-command");
}

/*
 * Output parameters to the HD controller.
 */
static void hd_out(unsigned int drive, unsigned int nsect,
		   unsigned int sect, unsigned int head,
		   unsigned int cyl, unsigned int cmd)
{
	unsigned short port;

	if (drive > 1 || head > 15)
		panic("Trying to write bad sector");

	port = HD_DATA;

	outb_p(hd_info[drive].ctl, HD_CMD);

	outb_p(hd_info[drive].wpcom >> 2, HD_PRECOMP);
	outb_p(nsect, HD_SECCOUNT);
	outb_p(sect, HD_SECTOR);
	outb_p(cyl & 0xff, HD_LCYL);
	outb_p(cyl >> 8, HD_HCYL);
	outb_p(0xa0 | (drive << 4) | head, HD_CURRENT);
	outb(cmd, HD_CMD);
}

/*
 * HD interrupt handler. Called after each sector transfer.
 */
static void hd_interrupt(void)
{
	void (*handler)(void);

	handler = do_hd;
	do_hd = NULL;
	handler();
}

/*
 * Initialize the hard disk subsystem.
 */
void hd_init(void)
{
	int drive;

	for (drive = 0; drive < NR_HD; drive++) {
		hd[drive].start_sect = 0;
		hd[drive].nr_sects = 0;
	}

	blk_dev[MAJOR_NR].request_fn = DEVICE_REQUEST;
	blk_dev[MAJOR_NR].current_request = NULL;

	set_intr_gate(0x2E, &hd_interrupt);
	outb_p(inb_p(0x21) & 0xfb, 0x21);
	outb(inb_p(0xA1) & 0xbf, 0xA1);
}

/*
 * Read a block through the block device layer.
 */
int block_read(int dev, char *buf, int count, unsigned long pos)
{
	struct buffer_head *bh;
	int block, chars, read;

	read = 0;
	block = pos / BLOCK_SIZE;

	while (count > 0) {
		chars = BLOCK_SIZE - (pos % BLOCK_SIZE);
		if (chars > count)
			chars = count;

		bh = bread(dev, block);
		if (!bh)
			return read ? read : -EIO;

		memcpy(buf, bh->b_data + (pos % BLOCK_SIZE), chars);
		brelse(bh);

		buf += chars;
		pos += chars;
		read += chars;
		count -= chars;
		block++;
	}
	return read;
}
