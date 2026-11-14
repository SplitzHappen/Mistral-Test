from django import template

register = template.Library()


@register.filter
def money(minor):
    minor = int(minor)
    sign = "-" if minor < 0 else ""
    absolute = abs(minor)
    return f"{sign}{absolute // 100}.{absolute % 100:02d}"
