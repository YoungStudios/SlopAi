import fs from 'fs'
import path from 'path'

export default function Page() {
  const html = fs.readFileSync(path.join(process.cwd(), 'public/index.html'), 'utf8')
  return <div dangerouslySetInnerHTML={{ __html: html }} />
}
