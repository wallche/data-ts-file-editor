import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import './globals.css'

export const metadata: Metadata = {
  title: 'Data.ts File Editor',
  description: 'Created with v0, idea and prompts by Milena Pacherazova - UX/UI Designer with some coding skills',
  generator: 'v0.dev',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <head>
        <style>{`
html {
  font-family: ${GeistSans.style.fontFamily};
  --font-sans: ${GeistSans.variable};
  --font-mono: ${GeistMono.variable};
}
        `}</style>
      </head>
      <body className="bg-gradient-to-br from-slate-50 to-blue-50">{children}
        <script type="text/javascript">
          (function(l,e,a,p) {
            if (window.Sprig) return;
            window.Sprig = function(){S._queue.push(arguments)}
            var S = window.Sprig;S.appId = a;S._queue = [];window.UserLeap=S;
            a=l.createElement('script');
            a.async=1;a.src=e+'?id='+S.appId;
            p=l.getElementsByTagName('script')[0];
            p.parentNode.insertBefore(a, p);
          })(document, 'https://cdn.sprig.com/shim.js', 'R69zSijMMoql');
        </script>
      </body>
    </html>
  )
}
