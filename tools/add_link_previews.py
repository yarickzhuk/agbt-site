#!/usr/bin/env python3
"""Adds link-preview (Open Graph / Twitter) tags and a canonical link to
index.html and wiki/*.html, and writes robots.txt and sitemap.xml.

Run it from the site root (the folder that holds index.html and wiki/), e.g.
agbt-pixi's site/ folder:

    python3 add_link_previews.py

It only inserts lines in <head>, right after <meta name="description">, and
is safe to re-run: it removes the block it added before adding it again.
"""
import re,glob,os
BASE='https://agamebeforetime.xyz'
IMG=BASE+'/media/title_logo_still.png'
def tags(title,desc,url,is_home):
    return (f'<link rel="canonical" href="{url}">\n'
            f'<meta property="og:type" content="website">\n'
            f'<meta property="og:site_name" content="A Game Before Time">\n'
            f'<meta property="og:title" content="{title}">\n'
            f'<meta property="og:description" content="{desc}">\n'
            f'<meta property="og:url" content="{url}">\n'
            f'<meta property="og:image" content="{IMG}">\n'
            f'<meta property="og:image:alt" content="A Game Before Time title logo">\n'
            f'<meta name="twitter:card" content="summary_large_image">\n')
def process(path,url):
    s=open(path).read()
    # idempotent: drop any previous block
    s=re.sub(r'<link rel="canonical"[^>]*>\n','',s)
    s=re.sub(r'<meta (?:property="og:[^"]*"|name="twitter:card")[^>]*>\n','',s)
    t=re.search(r'<title>(.*?)</title>',s,re.S).group(1).strip()
    m=re.search(r'<meta name="description" content="([^"]*)">\n',s)
    assert m,path
    s=s[:m.end()]+tags(t,m.group(1),url,url==BASE+'/')+s[m.end():]
    open(path,'w').write(s)
urls=[BASE+'/']
process('index.html',BASE+'/')
for f in sorted(glob.glob('wiki/*.html')):
    name=os.path.basename(f)
    url=BASE+'/wiki/' if name=='index.html' else BASE+'/wiki/'+name
    process(f,url); urls.append(url)
urls=[urls[0]]+sorted(urls[1:])
open('robots.txt','w').write('User-agent: *\nAllow: /\n\nSitemap: '+BASE+'/sitemap.xml\n')
x='<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+''.join(f'  <url><loc>{u}</loc></url>\n' for u in urls)+'</urlset>\n'
open('sitemap.xml','w').write(x)
print(len(urls),'urls')
