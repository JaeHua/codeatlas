/*
 * linux/lib/vsprintf.c
 *
 * (C) 1991 Linus Torvalds
 *
 * Minimal vsprintf/printk implementation.
 * Handles %s, %d, %x, %o, %c, %%.
 */

#include <linux/kernel.h>
#include <stdarg.h>

#define is_digit(c) ((c) >= '0' && (c) <= '9')

/*
 * Convert an integer to a string.
 */
static char *number(char *str, int num, int base, int size,
		    int precision, int type)
{
	char c, sign, tmp[36];
	const char *digits = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
	int i;

	if (type & SMALL)
		digits = "0123456789abcdefghijklmnopqrstuvwxyz";
	if (type & LEFT)
		type &= ~ZEROPAD;
	if (base < 2 || base > 36)
		return 0;

	c = (type & ZEROPAD) ? '0' : ' ';

	sign = 0;
	if (type & SIGN) {
		if (num < 0) {
			sign = '-';
			num = -num;
			size--;
		} else if (type & PLUS) {
			sign = '+';
			size--;
		} else if (type & SPACE) {
			sign = ' ';
			size--;
		}
	}

	i = 0;
	if (num == 0)
		tmp[i++] = '0';
	else while (num != 0) {
		tmp[i++] = digits[do_div(num, base)];
	}

	if (i > precision)
		precision = i;
	size -= precision;

	if (!(type & (ZEROPAD + LEFT)))
		while (size-- > 0)
			*str++ = ' ';

	if (sign)
		*str++ = sign;

	if (!(type & LEFT))
		while (size-- > 0)
			*str++ = c;

	while (i < precision--)
		*str++ = '0';

	while (i-- > 0)
		*str++ = tmp[i];

	while (size-- > 0)
		*str++ = ' ';

	return str;
}

/*
 * Minimal vsprintf() for kernel use.
 */
int vsprintf(char *buf, const char *fmt, va_list args)
{
	char *str, *s;
	int *ip;
	int flags;
	int field_width;
	int precision;
	int len;

	for (str = buf; *fmt; fmt++) {
		if (*fmt != '%') {
			*str++ = *fmt;
			continue;
		}

		flags = 0;
		fmt++;

		while (1) {
			switch (*fmt) {
			case '-': flags |= LEFT;  fmt++; continue;
			case '+': flags |= PLUS;  fmt++; continue;
			case ' ': flags |= SPACE; fmt++; continue;
			case '#': flags |= SPECIAL; fmt++; continue;
			case '0': flags |= ZEROPAD; fmt++; continue;
			}
			break;
		}

		field_width = -1;
		if (is_digit(*fmt))
			field_width = skip_atoi(&fmt);
		else if (*fmt == '*') {
			field_width = va_arg(args, int);
			if (field_width < 0) {
				field_width = -field_width;
				flags |= LEFT;
			}
			fmt++;
		}

		precision = -1;
		if (*fmt == '.') {
			fmt++;
			if (is_digit(*fmt))
				precision = skip_atoi(&fmt);
			else if (*fmt == '*') {
				precision = va_arg(args, int);
				if (precision < 0)
					precision = 0;
				fmt++;
			}
		}

		if (*fmt == 'l') {
			fmt++;
		}

		switch (*fmt) {
		case 'c':
			if (!(flags & LEFT))
				while (--field_width > 0)
					*str++ = ' ';
			*str++ = (unsigned char)va_arg(args, int);
			while (--field_width > 0)
				*str++ = ' ';
			break;

		case 's':
			s = va_arg(args, char *);
			if (!s)
				s = "(null)";
			len = strlen(s);
			if (precision >= 0 && len > precision)
				len = precision;
			if (!(flags & LEFT))
				while (len < field_width--)
					*str++ = ' ';
			while (len-- > 0)
				*str++ = *s++;
			while (field_width-- > 0)
				*str++ = ' ';
			break;

		case 'o':
			str = number(str, va_arg(args, unsigned long), 8,
				     field_width, precision, flags);
			break;

		case 'p':
			if (field_width == -1) {
				field_width = 8;
				flags |= ZEROPAD;
			}
			str = number(str,
				     (unsigned long)va_arg(args, void *), 16,
				     field_width, precision, flags);
			break;

		case 'x':
			flags |= SMALL;
			/* fall through */
		case 'X':
			str = number(str, va_arg(args, unsigned long), 16,
				     field_width, precision, flags);
			break;

		case 'd':
		case 'i':
			flags |= SIGN;
			str = number(str, va_arg(args, int), 10,
				     field_width, precision, flags);
			break;

		case 'u':
			str = number(str, va_arg(args, unsigned long), 10,
				     field_width, precision, flags);
			break;

		case 'n':
			ip = va_arg(args, int *);
			*ip = (str - buf);
			break;

		default:
			if (*fmt != '%')
				*str++ = '%';
			if (*fmt)
				*str++ = *fmt;
			else
				fmt--;
			break;
		}
	}
	*str = '\0';
	return str - buf;
}

/*
 * Kernel print function.
 */
int printk(const char *fmt, ...)
{
	va_list args;
	int i;

	va_start(args, fmt);
	i = vsprintf(printbuf, fmt, args);
	va_end(args);

	console_print(printbuf);
	return i;
}
