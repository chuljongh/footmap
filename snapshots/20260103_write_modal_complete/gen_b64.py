import base64

svg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M4 6l6 6-6 6 M14 6l6 6-6 6" stroke="white" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>'
b64 = base64.b64encode(svg.encode('utf-8')).decode('utf-8')
print(b64)
