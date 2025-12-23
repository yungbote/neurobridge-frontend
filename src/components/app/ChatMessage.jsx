// src/components/chat-message.jsx
"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import {
  Copy,
  ThumbsUp,
  ThumbsDown,
  Share,
  RotateCcw,
  MoreHorizontal,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Check,
  Download,
  FileText,
  File,
  Play,
  Pause,
  Maximize2,
  Volume2,
  VolumeX,
  ExternalLink,
  Square,
  CheckSquare,
  AlertCircle,
  AlertTriangle,
  Info,
  CheckCircle2,
  X,
} from "lucide-react"

const syntaxColors = {
  keyword: { default: "text-purple-600 dark:text-purple-400" },
  string: { default: "text-green-600 dark:text-green-400" },
  comment: { default: "text-zinc-400 dark:text-zinc-500 italic" },
  function: { default: "text-blue-600 dark:text-blue-400" },
  number: { default: "text-amber-600 dark:text-amber-400" },
  operator: { default: "text-zinc-600 dark:text-zinc-400" },
  type: { default: "text-cyan-600 dark:text-cyan-400" },
  variable: { default: "text-foreground" },
}

function highlightCode(code, language) {
  const lines = String(code || "").split("\n")

  const keywords = {
    python: [
      "import","from","def","class","return","if","else","elif","for","while","try","except","with","as","in","is","not",
      "and","or","True","False","None","async","await","yield","lambda","pass","break","continue","raise","finally",
    ],
    javascript: [
      "import","export","from","const","let","var","function","return","if","else","for","while","try","catch","finally",
      "class","extends","new","this","super","async","await","yield","true","false","null","undefined","typeof",
      "instanceof","throw","switch","case","default","break","continue",
    ],
    typescript: [
      "import","export","from","const","let","var","function","return","if","else","for","while","try","catch","finally",
      "class","extends","new","this","super","async","await","yield","true","false","null","undefined","typeof",
      "instanceof","throw","switch","case","default","break","continue","interface","type","enum","implements",
      "abstract","private","public","protected","readonly","as","keyof","infer","never","unknown",
    ],
    tsx: [],
    jsx: [],
    sql: [
      "SELECT","FROM","WHERE","INSERT","INTO","VALUES","UPDATE","SET","DELETE","CREATE","TABLE","DROP","ALTER","INDEX",
      "JOIN","LEFT","RIGHT","INNER","OUTER","ON","AND","OR","NOT","NULL","PRIMARY","KEY","FOREIGN","REFERENCES","ORDER",
      "BY","GROUP","HAVING","LIMIT","OFFSET","DISTINCT","AS","CASE","WHEN","THEN","ELSE","END","EXISTS","IN","LIKE",
      "BETWEEN","UNION","ALL",
    ],
    bash: [
      "if","then","else","elif","fi","for","while","do","done","case","esac","function","return","exit","echo","export",
      "source","local","readonly","declare","unset","shift","break","continue",
    ],
    css: ["@import","@media","@keyframes","@font-face","@supports","@layer","!important"],
    html: [],
    json: [],
    yaml: ["true","false","null","yes","no","on","off"],
    rust: [
      "fn","let","mut","const","static","struct","enum","impl","trait","type","where","for","loop","while","if","else",
      "match","return","break","continue","move","ref","self","Self","pub","mod","use","crate","super","as","in","unsafe",
      "async","await","dyn","true","false",
    ],
    go: [
      "package","import","func","var","const","type","struct","interface","map","chan","if","else","for","range","switch",
      "case","default","break","continue","return","go","defer","select","fallthrough","true","false","nil",
    ],
  }

  const types = {
    python: ["int","str","float","bool","list","dict","tuple","set","Optional","List","Dict","Tuple","Set","Any","Union","Callable"],
    typescript: ["string","number","boolean","void","any","unknown","never","object","Array","Promise","Record","Partial","Required","Pick","Omit","Exclude","Extract","ReturnType","Parameters"],
    tsx: ["string","number","boolean","void","any","unknown","never","object","Array","Promise","Record","Partial","Required","Pick","Omit","Exclude","Extract","ReturnType","Parameters","React","ReactNode","FC","Component"],
    rust: ["i8","i16","i32","i64","i128","isize","u8","u16","u32","u64","u128","usize","f32","f64","bool","char","str","String","Vec","Box","Rc","Arc","Option","Result","Ok","Err","Some","None"],
    go: ["int","int8","int16","int32","int64","uint","uint8","uint16","uint32","uint64","float32","float64","complex64","complex128","bool","string","byte","rune","error"],
  }

  const lang = (language || "default").toLowerCase()
  const langKeywords = keywords[lang] || keywords.javascript || []
  const langTypes = types[lang] || []

  return lines.map((line, lineIndex) => {
    const tokens = []
    let remaining = line
    let tokenIndex = 0

    while (remaining.length > 0) {
      let matched = false

      if (remaining.startsWith("//") || remaining.startsWith("#") || remaining.startsWith("--")) {
        tokens.push(
          <span key={`${lineIndex}-${tokenIndex++}`} className={syntaxColors.comment.default}>
            {remaining}
          </span>,
        )
        remaining = ""
        matched = true
      } else if (remaining.startsWith("/*") || remaining.startsWith("'''") || remaining.startsWith('"""')) {
        tokens.push(
          <span key={`${lineIndex}-${tokenIndex++}`} className={syntaxColors.comment.default}>
            {remaining}
          </span>,
        )
        remaining = ""
        matched = true
      } else {
        const m1 = remaining.match(/^"(?:[^"\\]|\\.)*"/)
        if (m1) {
          tokens.push(
            <span key={`${lineIndex}-${tokenIndex++}`} className={syntaxColors.string.default}>
              {m1[0]}
            </span>,
          )
          remaining = remaining.slice(m1[0].length)
          matched = true
        }
      }

      if (!matched) {
        const m2 = remaining.match(/^'(?:[^'\\]|\\.)*'/)
        if (m2) {
          tokens.push(
            <span key={`${lineIndex}-${tokenIndex++}`} className={syntaxColors.string.default}>
              {m2[0]}
            </span>,
          )
          remaining = remaining.slice(m2[0].length)
          matched = true
        }
      }

      if (!matched) {
        const m3 = remaining.match(/^`(?:[^`\\]|\\.)*`/)
        if (m3) {
          tokens.push(
            <span key={`${lineIndex}-${tokenIndex++}`} className={syntaxColors.string.default}>
              {m3[0]}
            </span>,
          )
          remaining = remaining.slice(m3[0].length)
          matched = true
        }
      }

      if (!matched) {
        const m4 = remaining.match(/^-?\d+\.?\d*(e[+-]?\d+)?/i)
        if (m4) {
          tokens.push(
            <span key={`${lineIndex}-${tokenIndex++}`} className={syntaxColors.number.default}>
              {m4[0]}
            </span>,
          )
          remaining = remaining.slice(m4[0].length)
          matched = true
        }
      }

      if (!matched) {
        const m5 = remaining.match(/^[a-zA-Z_]\w*/)
        if (m5) {
          const word = m5[0]

          if (langKeywords.includes(word)) {
            tokens.push(
              <span key={`${lineIndex}-${tokenIndex++}`} className={syntaxColors.keyword.default}>
                {word}
              </span>,
            )
          } else if (langTypes.includes(word)) {
            tokens.push(
              <span key={`${lineIndex}-${tokenIndex++}`} className={syntaxColors.type.default}>
                {word}
              </span>,
            )
          } else if (remaining.slice(word.length).match(/^\s*\(/)) {
            tokens.push(
              <span key={`${lineIndex}-${tokenIndex++}`} className={syntaxColors.function.default}>
                {word}
              </span>,
            )
          } else {
            tokens.push(
              <span key={`${lineIndex}-${tokenIndex++}`} className={syntaxColors.variable.default}>
                {word}
              </span>,
            )
          }

          remaining = remaining.slice(word.length)
          matched = true
        }
      }

      if (!matched) {
        const m6 = remaining.match(/^[+\-*/%=<>!&|^~?:;,.()[\]{}@#]+/)
        if (m6) {
          tokens.push(
            <span key={`${lineIndex}-${tokenIndex++}`} className={syntaxColors.operator.default}>
              {m6[0]}
            </span>,
          )
          remaining = remaining.slice(m6[0].length)
          matched = true
        }
      }

      if (!matched) {
        tokens.push(remaining[0])
        remaining = remaining.slice(1)
      }
    }

    return (
      <React.Fragment key={lineIndex}>
        {tokens}
        {lineIndex < lines.length - 1 && "\n"}
      </React.Fragment>
    )
  })
}

function CodeBlock({ children, language, filename, showLineNumbers = false, highlightLines }) {
  const [copied, setCopied] = React.useState(false)
  const lines = String(children || "").split("\n")

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(String(children || ""))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  return (
    <div className="my-4 overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
      <div className="flex items-center justify-between px-4 py-2 text-sm text-muted-foreground border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <span className="font-medium">{filename || language || "code"}</span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
        >
          {copied ? (
            <>
              <Check className="h-4 w-4" />
              <span>Copied!</span>
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" />
              <span>Copy code</span>
            </>
          )}
        </button>
      </div>
      <div className="overflow-x-auto">
        <pre className="text-sm p-4">
          <code className="font-mono text-foreground">
            {showLineNumbers ? (
              <div className="flex">
                <div className="select-none pr-4 text-muted-foreground/50 text-right">
                  {lines.map((_, i) => (
                    <div key={i} className={cn(highlightLines?.includes(i + 1) && "bg-yellow-500/10")}>
                      {i + 1}
                    </div>
                  ))}
                </div>
                <div className="flex-1">
                  {lines.map((line, i) => (
                    <div key={i} className={cn(highlightLines?.includes(i + 1) && "bg-yellow-500/10 -mx-4 px-4")}>
                      {highlightCode(line, language)}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              highlightCode(children, language)
            )}
          </code>
        </pre>
      </div>
    </div>
  )
}

function InlineCode({ children }) {
  return (
    <code className="rounded-md bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 font-mono text-sm text-foreground border border-zinc-200 dark:border-zinc-700">
      {children}
    </code>
  )
}

function ImageBlock({ src, alt, caption, width, height }) {
  const [isExpanded, setIsExpanded] = React.useState(false)
  const [isLoaded, setIsLoaded] = React.useState(false)
  const [hasError, setHasError] = React.useState(false)

  return (
    <>
      <figure className="my-4">
        <div
          className={cn(
            "relative overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900",
            "cursor-pointer group",
          )}
          onClick={() => setIsExpanded(true)}
        >
          {!isLoaded && !hasError && <div className="absolute inset-0 animate-pulse bg-zinc-200 dark:bg-zinc-800" />}
          {hasError ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground">
              <AlertCircle className="h-8 w-8 mr-2" />
              <span>Failed to load image</span>
            </div>
          ) : (
            <>
              <img
                src={src || "/placeholder.svg"}
                alt={alt || "Image"}
                width={width}
                height={height}
                onLoad={() => setIsLoaded(true)}
                onError={() => setHasError(true)}
                className={cn("max-w-full h-auto transition-opacity duration-300", isLoaded ? "opacity-100" : "opacity-0")}
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                <Maximize2 className="h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
              </div>
            </>
          )}
        </div>
        {caption && <figcaption className="mt-2 text-center text-sm text-muted-foreground">{caption}</figcaption>}
      </figure>

      {isExpanded && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setIsExpanded(false)}
        >
          <button
            className="absolute top-4 right-4 p-2 text-white hover:bg-white/10 rounded-lg transition-colors"
            onClick={() => setIsExpanded(false)}
          >
            <X className="h-6 w-6" />
          </button>
          <img
            src={src || "/placeholder.svg"}
            alt={alt || "Image"}
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  )
}

function VideoBlock({ src, poster, caption, autoPlay = false, loop = false, muted = true }) {
  const videoRef = React.useRef(null)
  const [isPlaying, setIsPlaying] = React.useState(autoPlay)
  const [isMuted, setIsMuted] = React.useState(muted)
  const [progress, setProgress] = React.useState(0)
  const [isFullscreen, setIsFullscreen] = React.useState(false)

  const togglePlay = () => {
    const v = videoRef.current
    if (!v) return
    if (isPlaying) v.pause()
    else v.play()
    setIsPlaying(!isPlaying)
  }

  const toggleMute = () => {
    const v = videoRef.current
    if (!v) return
    v.muted = !isMuted
    setIsMuted(!isMuted)
  }

  const toggleFullscreen = () => {
    const v = videoRef.current
    if (!v) return
    if (!isFullscreen) {
      v.requestFullscreen?.()
    } else {
      document.exitFullscreen?.()
    }
    setIsFullscreen(!isFullscreen)
  }

  const handleTimeUpdate = () => {
    const v = videoRef.current
    if (!v || !v.duration) return
    setProgress((v.currentTime / v.duration) * 100)
  }

  const handleSeek = (e) => {
    const v = videoRef.current
    if (!v || !v.duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const pos = (e.clientX - rect.left) / rect.width
    v.currentTime = pos * v.duration
  }

  return (
    <figure className="my-4">
      <div className="relative overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 bg-black group">
        <video
          ref={videoRef}
          src={src}
          poster={poster}
          autoPlay={autoPlay}
          loop={loop}
          muted={muted}
          onTimeUpdate={handleTimeUpdate}
          onEnded={() => setIsPlaying(false)}
          className="w-full"
        />

        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="h-1 bg-white/30 rounded-full mb-3 cursor-pointer" onClick={handleSeek}>
            <div className="h-full bg-white rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>

          <div className="flex items-center gap-2">
            <button onClick={togglePlay} className="p-1.5 text-white hover:bg-white/20 rounded transition-colors">
              {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
            </button>
            <button onClick={toggleMute} className="p-1.5 text-white hover:bg-white/20 rounded transition-colors">
              {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </button>
            <div className="flex-1" />
            <button onClick={toggleFullscreen} className="p-1.5 text-white hover:bg-white/20 rounded transition-colors">
              <Maximize2 className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
      {caption && <figcaption className="mt-2 text-center text-sm text-muted-foreground">{caption}</figcaption>}
    </figure>
  )
}

function FileAttachment({ filename, size, url, type }) {
  const getIcon = () => {
    if (type?.includes("pdf")) return <FileText className="h-5 w-5" />
    return <File className="h-5 w-5" />
  }

  return (
    <a
      href={url}
      download={filename}
      className="my-3 flex items-center gap-3 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors group"
    >
      <div className="p-2 rounded-lg bg-zinc-200 dark:bg-zinc-700 text-muted-foreground">{getIcon()}</div>
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{filename}</div>
        {size && <div className="text-sm text-muted-foreground">{size}</div>}
      </div>
      <Download className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
    </a>
  )
}

function LinkPreview({ url, title, description, image, favicon }) {
  let host = url
  try { host = new URL(url).hostname } catch {}

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="my-4 flex overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors group"
    >
      {image && (
        <div className="w-32 sm:w-48 flex-shrink-0 bg-zinc-200 dark:bg-zinc-800">
          <img src={image || "/placeholder.svg"} alt="" className="w-full h-full object-cover" />
        </div>
      )}
      <div className="flex-1 p-4 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          {favicon && <img src={favicon || "/placeholder.svg"} alt="" className="w-4 h-4" />}
          <span className="text-xs text-muted-foreground truncate">{host}</span>
          <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
        <div className="font-medium truncate">{title}</div>
        {description && <div className="text-sm text-muted-foreground line-clamp-2 mt-1">{description}</div>}
      </div>
    </a>
  )
}

function MathBlock({ children, inline = false }) {
  if (inline) {
    return <span className="font-mono text-sm bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">{children}</span>
  }

  return (
    <div className="my-4 p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 overflow-x-auto">
      <div className="text-center font-mono text-lg">{children}</div>
    </div>
  )
}

function Table({ headers, rows, caption }) {
  return (
    <div className="my-4 overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
      <table className="w-full text-sm">
        {caption && (
          <caption className="px-4 py-2 text-left text-muted-foreground bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
            {caption}
          </caption>
        )}
        <thead>
          <tr className="bg-zinc-100 dark:bg-zinc-900">
            {headers.map((header, i) => (
              <th
                key={i}
                className="px-4 py-3 text-left font-medium text-foreground border-b border-zinc-200 dark:border-zinc-800"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className="border-b border-zinc-200 dark:border-zinc-800 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors"
            >
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-3">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TaskList({ items }) {
  return (
    <div className="my-4 space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-3">
          <div className={cn("mt-0.5 flex-shrink-0", item.checked ? "text-green-600 dark:text-green-400" : "text-muted-foreground")}>
            {item.checked ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />}
          </div>
          <span className={cn(item.checked && "line-through text-muted-foreground")}>{item.text}</span>
        </div>
      ))}
    </div>
  )
}

function Callout({ type = "info", title, children }) {
  const styles = {
    info: {
      bg: "bg-blue-50 dark:bg-blue-950/30",
      border: "border-blue-200 dark:border-blue-900",
      icon: <Info className="h-5 w-5 text-blue-600 dark:text-blue-400" />,
      title: "text-blue-900 dark:text-blue-100",
    },
    warning: {
      bg: "bg-amber-50 dark:bg-amber-950/30",
      border: "border-amber-200 dark:border-amber-900",
      icon: <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />,
      title: "text-amber-900 dark:text-amber-100",
    },
    error: {
      bg: "bg-red-50 dark:bg-red-950/30",
      border: "border-red-200 dark:border-red-900",
      icon: <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />,
      title: "text-red-900 dark:text-red-100",
    },
    success: {
      bg: "bg-green-50 dark:bg-green-950/30",
      border: "border-green-200 dark:border-green-900",
      icon: <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />,
      title: "text-green-900 dark:text-green-100",
    },
  }

  const s = styles[type] || styles.info

  return (
    <div className={cn("my-4 p-4 rounded-xl border", s.bg, s.border)}>
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">{s.icon}</div>
        <div className="flex-1 min-w-0">
          {title && <div className={cn("font-medium mb-1", s.title)}>{title}</div>}
          <div className="text-sm">{children}</div>
        </div>
      </div>
    </div>
  )
}

function Divider() {
  return <hr className="my-6 border-zinc-200 dark:border-zinc-800" />
}

function Kbd({ children }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[1.5rem] h-6 px-1.5 text-xs font-mono font-medium bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 rounded shadow-sm">
      {children}
    </kbd>
  )
}

function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-2 text-muted-foreground py-2">
      <Sparkles className="h-4 w-4" />
      <span className="text-sm">Thinking</span>
      <span className="flex gap-1">
        <span className="h-1 w-1 rounded-full bg-muted-foreground/70 animate-bounce [animation-delay:-0.3s]" />
        <span className="h-1 w-1 rounded-full bg-muted-foreground/70 animate-bounce [animation-delay:-0.15s]" />
        <span className="h-1 w-1 rounded-full bg-muted-foreground/70 animate-bounce" />
      </span>
    </div>
  )
}

function ThinkingContent({ children, duration, defaultExpanded = false, disableToggle = false, onHeaderClick }) {
  const [isExpanded, setIsExpanded] = React.useState(defaultExpanded)

  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={() => {
          onHeaderClick?.()
          if (disableToggle) return
          setIsExpanded(!isExpanded)
        }}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
      >
        {!disableToggle && (isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />)}
        <Sparkles className="h-3.5 w-3.5" />
        <span>Thought for {duration || "a few seconds"}</span>
      </button>
      {isExpanded && (
        <div className="pl-6 border-l-2 border-zinc-200 dark:border-zinc-800 text-sm text-muted-foreground leading-relaxed">
          {children}
        </div>
      )}
    </div>
  )
}

function ActionBar({ onCopy, onLike, onDislike, onShare, onRegenerate }) {
  return (
    <div className="flex items-center gap-1 mt-4">
      <ActionButton onClick={onCopy} aria-label="Copy">
        <Copy className="h-4 w-4" />
      </ActionButton>
      <ActionButton onClick={onLike} aria-label="Like">
        <ThumbsUp className="h-4 w-4" />
      </ActionButton>
      <ActionButton onClick={onDislike} aria-label="Dislike">
        <ThumbsDown className="h-4 w-4" />
      </ActionButton>
      <ActionButton onClick={onShare} aria-label="Share">
        <Share className="h-4 w-4" />
      </ActionButton>
      <ActionButton onClick={onRegenerate} aria-label="Regenerate">
        <RotateCcw className="h-4 w-4" />
      </ActionButton>
      <ActionButton aria-label="More options">
        <MoreHorizontal className="h-4 w-4" />
      </ActionButton>
    </div>
  )
}

function ActionButton({ children, onClick, ...props }) {
  return (
    <button
      onClick={onClick}
      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
      {...props}
    >
      {children}
    </button>
  )
}

export function ChatMessage({
  variant,
  children,
  isThinking = false,
  thinkingContent,
  thinkingDuration,
  thinkingDefaultExpanded = false,
  disableThinkingToggle = false,
  onThinkingHeaderClick,
  showActions = true,
  onCopy,
  onLike,
  onDislike,
  onShare,
  onRegenerate,
  className,
}) {
  const isUser = variant === "user"

  if (isUser) {
    return (
      <div className={cn("flex w-full justify-end py-3", className)}>
        <div
          className={cn(
            "bg-zinc-100 dark:bg-zinc-800 text-foreground",
            "rounded-3xl px-5 py-2.5",
            "max-w-[85%] sm:max-w-[75%] md:max-w-[70%]",
            "min-h-[44px] flex items-center",
          )}
        >
          <div className="text-[15px] leading-relaxed">{children}</div>
        </div>
      </div>
    )
  }

  return (
    <div className={cn("w-full py-4", className)}>
      {isThinking && !children ? (
        <ThinkingIndicator />
      ) : (
        <>
          {thinkingContent && (
            <ThinkingContent
              duration={thinkingDuration}
              defaultExpanded={thinkingDefaultExpanded}
              disableToggle={disableThinkingToggle}
              onHeaderClick={onThinkingHeaderClick}
            >
              {thinkingContent}
            </ThinkingContent>
          )}

          <div
            className={cn(
              "text-[15px] leading-relaxed",
              "[&>p]:my-3 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0",
              "[&>ul]:my-3 [&>ol]:my-3",
              "[&>ul]:pl-5 [&>ol]:pl-5",
              "[&>ul>li]:my-1.5 [&>ol>li]:my-1.5",
              "[&_ul]:list-disc [&_ol]:list-decimal",
              "[&_li]:pl-1",
              "[&_ul_ul]:my-1 [&_ol_ol]:my-1 [&_ul_ol]:my-1 [&_ol_ul]:my-1",
              "[&>h1]:text-2xl [&>h1]:font-semibold [&>h1]:mt-8 [&>h1]:mb-4 [&>h1:first-child]:mt-0",
              "[&>h2]:text-xl [&>h2]:font-semibold [&>h2]:mt-6 [&>h2]:mb-3 [&>h2:first-child]:mt-0",
              "[&>h3]:text-lg [&>h3]:font-semibold [&>h3]:mt-5 [&>h3]:mb-2 [&>h3:first-child]:mt-0",
              "[&>h4]:text-base [&>h4]:font-semibold [&>h4]:mt-4 [&>h4]:mb-2 [&>h4:first-child]:mt-0",
              "[&>blockquote]:border-l-4 [&>blockquote]:border-zinc-300 [&>blockquote]:dark:border-zinc-700 [&>blockquote]:pl-4 [&>blockquote]:italic [&>blockquote]:text-muted-foreground [&>blockquote]:my-4",
              "[&_a]:text-blue-600 [&_a]:dark:text-blue-400 [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:no-underline",
              "[&_strong]:font-semibold",
              "[&_mark]:bg-yellow-200 [&_mark]:dark:bg-yellow-900/50 [&_mark]:px-1 [&_mark]:rounded",
            )}
          >
            {children}
          </div>

          {showActions && (
            <ActionBar
              onCopy={onCopy}
              onLike={onLike}
              onDislike={onDislike}
              onShare={onShare}
              onRegenerate={onRegenerate}
            />
          )}
        </>
      )}
    </div>
  )
}

ChatMessage.CodeBlock = CodeBlock
ChatMessage.InlineCode = InlineCode
ChatMessage.Image = ImageBlock
ChatMessage.Video = VideoBlock
ChatMessage.File = FileAttachment
ChatMessage.Link = LinkPreview
ChatMessage.Math = MathBlock
ChatMessage.Table = Table
ChatMessage.TaskList = TaskList
ChatMessage.Callout = Callout
ChatMessage.Divider = Divider
ChatMessage.Kbd = Kbd
ChatMessage.ThinkingIndicator = ThinkingIndicator
ChatMessage.ThinkingContent = ThinkingContent
ChatMessage.ActionBar = ActionBar









