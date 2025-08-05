"use client"

import type React from "react"

import { useState, useCallback, useRef, useEffect } from "react"
import { parse } from "@babel/parser"
import JSON5 from "json5"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Trash2, Plus, Download, Upload, FileText, ChevronRight, Eye, EyeOff } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"

interface DataItem {
  [key: string]: any
}

/* ---------- UTILITIES ---------- */

/** Fallback super-lenient evaluator */
const safeEval = (code: string) => {
  const fn = new Function(`"use strict"; return (${code});`)
  return fn()
}

/** Detect common image URL extensions */
const isImageUrl = (url: string) =>
  typeof url === "string" &&
  (/\.(jpe?g|png|gif|webp|svg|bmp|ico)(\?.*)?$/i.test(url) || url.includes("image") || url.includes("img"))

/* ---------- COMPONENT ---------- */

export default function FileContentEditor() {
  const [originalFileName, setOriginalFileName] = useState("")
  const [exportName, setExportName] = useState("data")
  const [data, setData] = useState<DataItem[]>([])
  const [isLoaded, setIsLoaded] = useState(false)
  const [error, setError] = useState("")
  const [originalImports, setOriginalImports] = useState("")
  const [quotedKeys, setQuotedKeys] = useState(false)
  const [showPreviews, setShowPreviews] = useState(true)
  const [newItemIndex, setNewItemIndex] = useState<number | null>(null)
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])
  const [deletingItems, setDeletingItems] = useState<Set<number>>(new Set())

  /* -------- PARSER (AST–based) -------- */

  const parseDataFile = useCallback((source: string) => {
    try {
      /* retain import lines so we can rewrite them later */
      const importLines = source.match(/^import\s+.*$/gm) || []
      setOriginalImports(importLines.join("\n"))

      /* build AST (handles TS, generics, etc.) */
      const ast = parse(source, {
        sourceType: "module",
        plugins: ["typescript"],
        errorRecovery: true,
      })

      let arraySlice = ""
      let foundExportName = exportName

      /* scan top-level statements */
      for (const node of ast.program.body) {
        // export default [...]
        if (node.type === "ExportDefaultDeclaration" && node.declaration.type === "ArrayExpression") {
          arraySlice = source.slice(node.declaration.start!, node.declaration.end!)
          foundExportName = "defaultExport"
          break
        }

        // export const foo = [...]
        if (node.type === "ExportNamedDeclaration" && node.declaration?.type === "VariableDeclaration") {
          for (const decl of node.declaration.declarations) {
            if (decl.init?.type === "ArrayExpression" && decl.id.type === "Identifier") {
              arraySlice = source.slice(decl.init.start!, decl.init.end!)
              foundExportName = decl.id.name
              break
            }
          }
        }

        if (arraySlice) break
      }

      if (!arraySlice) throw new Error("No exported array found.")

      setExportName(foundExportName)

      /* -------- try JSON5 first -------- */
      try {
        const parsed = JSON5.parse(`(${arraySlice})`)
        if (!Array.isArray(parsed)) throw new Error("Export is not an array")
        setData(parsed)
        setQuotedKeys(/"\w+"\s*:/.test(arraySlice))
        setError("")
        return true
      } catch (e) {
        // fall through to eval
      }

      /* -------- fallback: safeEval -------- */
      const evaluated = safeEval(arraySlice)
      if (!Array.isArray(evaluated)) throw new Error("Export is not an array")
      setData(evaluated)
      setQuotedKeys(/"\w+"\s*:/.test(arraySlice))
      setError("")
      return true
    } catch (err: any) {
      console.error("Parse error:", err)
      setError(`Failed to parse file: ${err.message}`)
      return false
    }
  }, [])

  /* -------- FILE UPLOAD -------- */

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!/\.tsx?$|\.jsx?$/.test(file.name)) {
      setError("Please upload a .ts/.tsx or .js/.jsx file")
      return
    }
    setOriginalFileName(file.name)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      if (parseDataFile(text)) setIsLoaded(true)
    }
    reader.readAsText(file)
  }

  /* -------- DATA MUTATION HELPERS -------- */

  const updateNestedValue = (itemIdx: number, path: string[], value: any) =>
    setData((prev) => {
      const next = structuredClone(prev)
      let ref: any = next[itemIdx]
      for (let i = 0; i < path.length - 1; i++) ref = ref[path[i]]
      ref[path.at(-1)!] = value
      return next
    })

  const addItem = () => {
    const newIndex = data.length
    setData((prev) => [...prev, Object.fromEntries(Object.keys(prev[0] ?? {}).map((k) => [k, ""]))])
    setNewItemIndex(newIndex)
  }

  const deleteItem = (idx: number) => {
    setDeletingItems((prev) => new Set(prev).add(idx))
    setTimeout(() => {
      setData((prev) => prev.filter((_, i) => i !== idx))
      setDeletingItems((prev) => {
        const next = new Set(prev)
        next.delete(idx)
        return next
      })
    }, 300) // Match the animation duration
  }

  /* -------- FILE DOWNLOAD -------- */

  const stringify = (obj: any, indent = 0): string => {
    const sp = "  ".repeat(indent)
    const nxt = "  ".repeat(indent + 1)
    if (Array.isArray(obj))
      return obj.length ? `[\n${obj.map((v) => nxt + stringify(v, indent + 1)).join(",\n")}\n${sp}]` : "[]"
    if (obj && typeof obj === "object")
      return `{\n${Object.entries(obj)
        .map(([k, v]) => `${nxt}${quotedKeys ? `"${k}"` : k}: ${stringify(v, indent + 1)}`)
        .join(",\n")}\n${sp}}`
    return typeof obj === "string" ? `"${obj}"` : String(obj)
  }

  const downloadFile = () => {
    const content =
      (originalImports ? originalImports + "\n\n" : "") + `export const ${exportName} = ${stringify(data)};\n`
    const blob = new Blob([content], { type: "text/typescript" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = originalFileName || "data.ts"
    a.click()
    URL.revokeObjectURL(url)
  }

  /* -------- RENDERERS -------- */

  const ImagePreview = ({ src }: { src: string }) =>
    showPreviews && isImageUrl(src) ? (
      <img
        src={src || "/placeholder.svg"}
        alt="preview"
        className="mt-2 border rounded max-w-[200px] max-h-[150px] object-contain"
      />
    ) : null

  const renderField = (val: any, path: string[], itemIdx: number): React.ReactNode => {
    if (Array.isArray(val))
      return (
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="p-0 h-auto">
              <ChevronRight className="w-4 h-4 mr-1" />
              Array ({val.length})
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="ml-4 space-y-2">
            {val.map((v, i) => (
              <div key={i} className="border-l pl-2">
                <Label className="text-xs">Item {i}</Label>
                {renderField(v, [...path, i.toString()], itemIdx)}
              </div>
            ))}
            <Button
              size="sm"
              variant="outline"
              onClick={() => updateNestedValue(itemIdx, path, [...val, typeof val[0] === "object" ? {} : ""])}
            >
              <Plus className="w-3 h-3 mr-1" /> Add
            </Button>
          </CollapsibleContent>
        </Collapsible>
      )
    if (val && typeof val === "object")
      return (
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="p-0 h-auto">
              <ChevronRight className="w-4 h-4 mr-1" />
              Object
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="ml-4 space-y-2">
            {Object.entries(val).map(([k, v]) => (
              <div key={k} className="border-l pl-2">
                <Label className="text-xs">{k}</Label>
                {renderField(v, [...path, k], itemIdx)}
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>
      )
    return (
      <div className="space-y-1">
        {String(val).length > 50 ? (
          <Textarea value={val} onChange={(e) => updateNestedValue(itemIdx, path, e.target.value)} />
        ) : (
          <Input value={val} onChange={(e) => updateNestedValue(itemIdx, path, e.target.value)} />
        )}
        {val && isImageUrl(val) && <ImagePreview src={val || "/placeholder.svg"} />}
      </div>
    )
  }

  /* -------- UI -------- */

  useEffect(() => {
    if (newItemIndex !== null && itemRefs.current[newItemIndex]) {
      // Scroll to the new item
      itemRefs.current[newItemIndex]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      })

      // Focus on the first input field of the new item
      setTimeout(() => {
        const firstInput = itemRefs.current[newItemIndex]?.querySelector("input, textarea") as
          | HTMLInputElement
          | HTMLTextAreaElement
        if (firstInput) {
          firstInput.focus()
          firstInput.select()
        }
      }, 500) // Small delay to ensure smooth scroll completes

      setNewItemIndex(null)
    }
  }, [newItemIndex, data])

  if (!isLoaded)
    return (
      <>
        <div className="flex flex-col bg-gradient-to-br from-slate-50 to-blue-50">
          <div className="min-h-screen flex-1 flex items-center justify-center p-6">
            <div className="w-full max-w-2xl">
              <div className="text-center mb-8">
                <div className="flex items-center justify-center gap-3 mb-6">
                  <FileText className="h-10 w-10 text-blue-500" />
                  <h1 className="text-5xl font-bold bg-gradient-to-tr from-blue-500 to-violet-800 bg-clip-text text-transparent">
                    Data.TS Content Editor
                  </h1>
                </div>
                <p className="text-md text-gray-600 max-w-xl mx-auto">
                  Upload your data.ts file and see it converted into clear, editable fields. Make some changes and download an updated file.
                </p>
              </div>
              <Card>
                <CardContent className="pt-[1.5rem] rounded-lg">
                  <div className="text-center space-y-4">
                    <Label
                      htmlFor="file-input"
                      className="border-2 border-dashed rounded-md p-12 text-center block cursor-pointer border-gray-300 hover:border-blue-500 hover:bg-blue-50/50 text-gray-500 hover:text-blue-600"
                    >
                      <Upload className="w-10 h-10 mx-auto mb-2" />
                      Click to choose a file
                    </Label>

                    <Input id="file-input" type="file" onChange={handleFileUpload} className="hidden" />
                    {error && (
                      <Alert variant="destructive">
                        <AlertDescription>{error}</AlertDescription>
                      </Alert>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>


          <div className="max-w-4xl mx-auto mb-8 p-6">
            <h2 className="text-2xl font-bold text-blue-500 mb-6 flex items-center justify-center gap-3">
              Why you'll like this
            </h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                { icon: "👁️", title: "Visualize and edit with ease", desc: "Interactive form UI that represents your data clearly" },
                { icon: "🔒", title: "Keep your code intact", desc: "Preserve formatting and order for smooth collaboration with developers" },
                { icon: "⚡", title: "No setup, no infrastructure", desc: "Just upload, edit, and download — no CMS or database needed" },
              ].map((feature, index) => (
                <div 
                  key={index} 
                  className="p-4 text-center"
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <span className="text-2xl flex-shrink-0">{feature.icon}</span>
                  <div>
                    <h3 className="font-semibold text-violet-800 mb-1">{feature.title}</h3>
                    <p className="text-gray-600 text-base">{feature.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="max-w-4xl mx-auto mb-8 p-6">
            <h2 className="text-2xl font-bold text-blue-500 mb-6 flex items-center justify-center gap-3">
              Who is it for?
            </h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { title: "Developers", desc: "who prefer to have visuals(?)" },
                { title: "Beginner Developers", desc: "who are less confortable with code syntax" },
                { title: "Non-developers", desc: "who want to edit static websites' content occasionally" },
                { title: "Anyone else", desc: "who have an idea what this tool is about" },
              ].map((feature, index) => (
                <div 
                  key={index} 
                  className="p-4 text-center"
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <div>
                    <h3 className="font-semibold text-violet-800 mb-1">{feature.title}</h3>
                    <p className="text-gray-600 text-base">{feature.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <footer className="py-8 border-t border-gray-200 bg-gray-50/50">
            <div className="container mx-auto max-w-6xl px-6">
              <p className="text-sm text-gray-600 leading-relaxed">
                Build with{" "}
                <a
                  href="https://v0.dev"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 underline transition-colors"
                >
                 v0
                </a>{" "}
                , by{" "}
                <a
                  href="https://www.linkedin.com/in/milenapacherazova/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 underline transition-colors"
                >
                 Milena P.
                </a>{" "}              
                 and styled with tailwind classes. Some things may not work but it is what it is... I'm just an amateur and this an experiment. Suggestions and improvements are welcome → use the feedback form on the right edge of the screen. Thanks!
              </p>
            </div>
          </footer>
        </div>
      </>
    )

  return (
    <>
      <div className="container mx-auto max-w-6xl space-y-4 bg-gradient-to-br from-slate-50 to-blue-50">
        <Card className="border-none bg-transparent">
          <CardHeader className="flex flex-wrap justify-between gap-4">
            <div className="flex flex-wrap justify-between items-center gap-4">
              <div>
                <CardTitle className="flex items-center gap-2 bg-gradient-to-tr from-blue-500 to-violet-800 bg-clip-text text-transparent">
                  <FileText className="w-5 h-5 text-blue-500" /> {originalFileName}
                </CardTitle>
                <CardDescription>
                  {data.length} item{data.length !== 1 && "s"} • export name: {exportName}
                </CardDescription>
              </div>
              <Button className="bg-violet-800 hover:bg-violet-600" size="sm" onClick={downloadFile}>
                <Download className="w-4 h-4 mr-1" /> Download
              </Button>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowPreviews((p) => !p)}>
                {showPreviews ? <EyeOff className="w-4 h-4 mr-1" /> : <Eye className="w-4 h-4 mr-1" />}
                {showPreviews ? "Hide" : "Show"} previews
              </Button>
              <Button size="sm" onClick={addItem}>
                <Plus className="w-4 h-4 mr-1" /> Add Item
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.map((item, idx) => (
              <Card
                className={`shadow-md transition-all duration-300 ${
                  deletingItems.has(idx)
                    ? "opacity-0 scale-95 transform -translate-y-2"
                    : "opacity-100 scale-100 transform translate-y-0"
                }`}
                key={idx}
                ref={(el) => (itemRefs.current[idx] = el)}
              >
                <CardHeader className="flex flex-row items-center justify-between shadow-none p-3 space-y-0 bg-gray-200 rounded-t-md">
                  <span className="text-sm font-medium">Item {idx + 1}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:bg-red-200 hover:text-destructive transition-all duration-200 hover:scale-110 active:scale-95"
                    onClick={() => deleteItem(idx)}
                    disabled={deletingItems.has(idx)}
                  >
                    <Trash2
                      className={`w-4 h-4 transition-transform duration-200 ${deletingItems.has(idx) ? "animate-pulse" : ""}`}
                    />
                  </Button>
                </CardHeader>
                <CardContent className="space-y-2 shadow-none">
                  {Object.entries(item).map(([k, v]) => (
                    <div key={k} className="space-y-1">
                      <Label className="text-xs">{k}</Label>
                      {renderField(v, [k], idx)}
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </CardContent>
        </Card>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>
      <footer className="py-8 border-t border-gray-200 bg-gray-50/50">
        <div className="container mx-auto max-w-6xl px-6">
          <p className="text-sm text-gray-600 leading-relaxed">
            Build with{" "}
            <a
              href="https://v0.dev"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 underline transition-colors"
            >
              v0
            </a>{" "}
            , by{" "}
            <a
              href="https://www.linkedin.com/in/milenapacherazova/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 underline transition-colors"
            >
              Milena P.
            </a>{" "}              
              and styled with tailwind classes. Some things may not work but it is what it is... I'm just an amateur and this an experiment. Suggestions and improvements are welcome → use the feedback form on the right edge of the screen. Thanks!
          </p>
        </div>
      </footer>
    </>
  )
}
