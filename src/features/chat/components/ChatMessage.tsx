// src/features/chat/components/ChatMessage.tsx
"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import type { ChatRole } from "@/shared/types/models"
import { cn } from "@/shared/lib/utils"
import { useI18n } from "@/app/providers/I18nProvider"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip"
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
  keyword: { default: "text-chart-4" },
  string: { default: "text-chart-2" },
  comment: { default: "text-muted-foreground italic" },
  function: { default: "text-chart-1" },
  number: { default: "text-chart-5" },
  operator: { default: "text-muted-foreground" },
  type: { default: "text-chart-3" },
  variable: { default: "text-foreground" },
}

type CalloutType = "info" | "warning" | "error" | "success"

interface CodeBlockProps {
  children?: React.ReactNode
  language?: string
  filename?: string
  showLineNumbers?: boolean
  highlightLines?: number[]
}

interface InlineCodeProps {
  children?: React.ReactNode
}

interface ImageBlockProps {
  src?: string
  alt?: string
  caption?: string
  width?: number
  height?: number
}

interface VideoBlockProps {
  src?: string
  poster?: string
  caption?: string
  autoPlay?: boolean
  loop?: boolean
  muted?: boolean
}

interface FileAttachmentProps {
  filename?: string
  size?: string | number
  url?: string
  type?: string
}

interface LinkPreviewProps {
  url: string
  title?: string
  description?: string
  image?: string
  favicon?: string
}

interface MathBlockProps {
  children?: React.ReactNode
  inline?: boolean
}

interface TableProps {
  headers?: React.ReactNode[]
  rows?: React.ReactNode[][]
  caption?: React.ReactNode
}

interface TaskListItem {
  text: string
  checked: boolean
}

interface TaskListProps {
  items?: TaskListItem[]
}

interface CalloutProps {
  type?: CalloutType
  title?: string
  children?: React.ReactNode
}

interface ThinkingContentProps {
  children?: React.ReactNode
  duration?: string | number
  defaultExpanded?: boolean
  disableToggle?: boolean
  onHeaderClick?: () => void
}

interface ActionBarProps {
  onCopy?: () => void
  onLike?: () => void
  onDislike?: () => void
  onShare?: () => void
  onRegenerate?: () => void
}

type ActionButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  children?: React.ReactNode
  shortcut?: string
}

interface ChatMessageProps {
  variant?: ChatRole
  children?: React.ReactNode
  isThinking?: boolean
  thinkingContent?: React.ReactNode
  thinkingDuration?: string | number
  thinkingDefaultExpanded?: boolean
  disableThinkingToggle?: boolean
  onThinkingHeaderClick?: () => void
  showActions?: boolean
  onCopy?: () => void
  onLike?: () => void
  onDislike?: () => void
  onShare?: () => void
  onRegenerate?: () => void
  className?: string
}

function highlightCode(code: unknown, language?: string): React.ReactNode[] {
  const lines = String(code || "").split("\n")

  const keywords: Record<string, string[]> = {
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

  const types: Record<string, string[]> = {
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

function CodeBlock({ children, language, filename, showLineNumbers = false, highlightLines }: CodeBlockProps) {
  const [copied, setCopied] = React.useState(false)
  const lines = String(children || "").split("\n")

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(String(children || ""))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      void err
    }
  }

  return (
    <div className="my-4 overflow-hidden rounded-xl border border-border/60 bg-muted/30 shadow-sm backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-border/60 bg-muted/40 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="truncate">{filename || language || "code"}</span>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground nb-motion-fast motion-reduce:transition-none hover:bg-muted/60 hover:text-foreground"
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
      <div dir="ltr" className="overflow-x-auto">
        <pre className="p-4 text-[13px] leading-relaxed">
          <code className="font-mono text-foreground">
            {showLineNumbers ? (
              <div className="flex">
                <div className="select-none pr-4 text-right text-muted-foreground/50">
                  {lines.map((_, i) => (
                    <div key={i} className={cn(highlightLines?.includes(i + 1) && "bg-primary/10")}>
                      {i + 1}
                    </div>
                  ))}
                </div>
                <div className="flex-1">
                  {lines.map((line, i) => (
                    <div key={i} className={cn(highlightLines?.includes(i + 1) && "bg-primary/10 -mx-4 px-4")}>
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

function InlineCode({ children }: InlineCodeProps) {
  return (
    <code className="rounded-md border border-border/60 bg-muted/50 px-1.5 py-0.5 font-mono text-[13px] text-foreground">
      {children}
    </code>
  )
}

function ImageBlock({ src, alt, caption, width, height }: ImageBlockProps) {
  const { t } = useI18n()
  const [isExpanded, setIsExpanded] = React.useState(false)
  const [isLoaded, setIsLoaded] = React.useState(false)
  const [hasError, setHasError] = React.useState(false)

  React.useEffect(() => {
    setIsLoaded(false)
    setHasError(false)
  }, [src])

  React.useEffect(() => {
    if (!isExpanded || typeof document === "undefined") return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [isExpanded])

  return (
    <>
      <figure className="my-4">
        <button
          type="button"
          aria-label={t("media.openImage")}
          className={cn(
            "relative w-full overflow-hidden rounded-2xl border border-border/60 bg-muted/20 shadow-sm",
            "cursor-pointer group text-start",
          )}
          onClick={() => setIsExpanded(true)}
        >
          {!isLoaded && !hasError && <div className="absolute inset-0 animate-pulse bg-muted" />}
          {hasError ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground">
              <AlertCircle className="h-8 w-8 me-2" />
              <span>{t("media.failedToLoadImage")}</span>
            </div>
          ) : (
            <>
              <img
                src={src || "/placeholder.svg"}
                alt={alt || t("common.image")}
                width={width}
                height={height}
                onLoad={() => setIsLoaded(true)}
                onError={() => setHasError(true)}
                loading="lazy"
                decoding="async"
                className={cn(
                  "max-w-full h-auto transition-opacity duration-300",
                  isLoaded ? "opacity-100" : "opacity-0",
                )}
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors nb-duration-micro nb-ease-out motion-reduce:transition-none flex items-center justify-center">
                <Maximize2 className="h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition-opacity nb-duration-micro nb-ease-out motion-reduce:transition-none drop-shadow-lg" />
              </div>
            </>
          )}
        </button>
        {caption && <figcaption className="mt-2 text-center text-sm text-muted-foreground">{caption}</figcaption>}
      </figure>

      {isExpanded && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[80] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
              onClick={() => setIsExpanded(false)}
            >
              <Tooltip>
                <TooltipTrigger asChild>
	                  <button
	                    type="button"
	                    aria-label={t("media.closeImage")}
	                    className="absolute top-4 end-4 rounded-full p-2 text-white/90 nb-motion-fast motion-reduce:transition-none hover:bg-white/10"
	                    onClick={() => setIsExpanded(false)}
	                  >
                    <X className="h-6 w-6" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left" shortcut="Esc">{t("common.close")}</TooltipContent>
              </Tooltip>
              <img
                src={src || "/placeholder.svg"}
                alt={alt || t("common.image")}
                className="max-h-[90vh] max-w-[92vw] rounded-2xl object-contain shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              />
            </div>,
            document.body
          )
        : null}
    </>
  )
}

function VideoBlock({ src, poster, caption, autoPlay = false, loop = false, muted = true }: VideoBlockProps) {
  const { t } = useI18n()
  const videoRef = React.useRef<HTMLVideoElement | null>(null)
  const expandedRef = React.useRef<HTMLVideoElement | null>(null)
  const [isPlaying, setIsPlaying] = React.useState(autoPlay)
  const [isMuted, setIsMuted] = React.useState(muted)
  const [progress, setProgress] = React.useState(0)
  const [isExpanded, setIsExpanded] = React.useState(false)
  const [expandedFrom, setExpandedFrom] = React.useState(0)
  const [expandedShouldPlay, setExpandedShouldPlay] = React.useState(false)

  const togglePlay = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) {
      v.play().catch(() => {})
    } else {
      v.pause()
    }
  }

  const toggleMute = () => {
    const v = videoRef.current
    if (!v) return
    v.muted = !isMuted
    setIsMuted(v.muted)
  }

  const openExpanded = () => {
    const v = videoRef.current
    if (!v) return
    const currentTime = v.currentTime || 0
    const wasPlaying = !v.paused
    v.pause()
    setExpandedFrom(currentTime)
    setExpandedShouldPlay(wasPlaying)
    setIsExpanded(true)
  }

  const handleTimeUpdate = () => {
    const v = videoRef.current
    if (!v || !v.duration) return
    setProgress((v.currentTime / v.duration) * 100)
  }

  const handlePlay = () => setIsPlaying(true)
  const handlePause = () => setIsPlaying(false)
  const handleVolumeChange = () => {
    const v = videoRef.current
    if (!v) return
    setIsMuted(v.muted || v.volume === 0)
  }

  const closeExpanded = () => {
    const expanded = expandedRef.current
    const currentTime = expanded?.currentTime ?? expandedFrom
    const wasPlaying = expanded ? !expanded.paused : expandedShouldPlay
    setIsExpanded(false)
    const inline = videoRef.current
    if (inline) {
      inline.currentTime = currentTime
      if (wasPlaying) {
        inline.play().catch(() => {})
      }
    }
  }

  React.useEffect(() => {
    if (!isExpanded) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeExpanded()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [isExpanded])

  React.useEffect(() => {
    if (!isExpanded) return
    const v = expandedRef.current
    if (!v) return
    const sync = () => {
      if (!Number.isFinite(expandedFrom)) return
      if (expandedFrom > 0 && v.duration) {
        v.currentTime = Math.min(expandedFrom, v.duration - 0.1)
      } else {
        v.currentTime = expandedFrom
      }
      if (expandedShouldPlay) {
        v.play().catch(() => {})
      }
    }
    if (v.readyState >= 1) {
      sync()
      return
    }
    v.addEventListener("loadedmetadata", sync, { once: true })
    return () => v.removeEventListener("loadedmetadata", sync)
  }, [expandedFrom, expandedShouldPlay, isExpanded])

  React.useEffect(() => {
    if (!isExpanded) return
    const v = expandedRef.current
    if (!v) return
    v.muted = isMuted
  }, [isExpanded, isMuted])

  React.useEffect(() => {
    if (!isExpanded || typeof document === "undefined") return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [isExpanded])

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current
    if (!v || !v.duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const pos = (e.clientX - rect.left) / rect.width
    v.currentTime = pos * v.duration
  }

  return (
    <>
      <figure className="my-4">
        <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card/80 shadow-sm backdrop-blur-sm group">
          <video
            ref={videoRef}
            src={src}
            poster={poster}
            autoPlay={autoPlay}
            loop={loop}
            muted={isMuted}
            onTimeUpdate={handleTimeUpdate}
            onEnded={() => setIsPlaying(false)}
            onPlay={handlePlay}
            onPause={handlePause}
            onVolumeChange={handleVolumeChange}
            className="w-full"
          />

          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="h-1 bg-white/30 rounded-full mb-3 cursor-pointer" onClick={handleSeek}>
              <div className="h-full bg-white rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>

            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={isPlaying ? t("media.pauseVideo") : t("media.playVideo")}
                    onClick={togglePlay}
                    className="rounded p-1.5 text-white transition-colors hover:bg-white/20"
                  >
                    {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" shortcut="Space">
                  {isPlaying ? t("media.pause") : t("media.play")}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={isMuted ? t("media.unmuteVideo") : t("media.muteVideo")}
                    onClick={toggleMute}
                    className="rounded p-1.5 text-white transition-colors hover:bg-white/20"
                  >
                    {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" shortcut="M">
                  {isMuted ? t("media.unmute") : t("media.mute")}
                </TooltipContent>
              </Tooltip>
              <div className="flex-1" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={t("common.openFullscreen")}
                    onClick={openExpanded}
                    className="rounded p-1.5 text-white transition-colors hover:bg-white/20"
                  >
                    <Maximize2 className="h-5 w-5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" shortcut="F">{t("common.openFullscreen")}</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>
        {caption && <figcaption className="mt-2 text-center text-sm text-muted-foreground">{caption}</figcaption>}
      </figure>

      {isExpanded && (
        typeof document !== "undefined"
          ? createPortal(
              <div
                className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4"
                onClick={closeExpanded}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
	                    <button
	                      type="button"
	                      aria-label={t("media.closeVideo")}
	                      className="absolute end-4 top-4 rounded-full p-2 text-white/90 transition-colors hover:bg-white/10"
	                      onClick={closeExpanded}
	                    >
                      <X className="h-6 w-6" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="left" shortcut="Esc">{t("common.close")}</TooltipContent>
                </Tooltip>
                <div
                  className="w-full max-w-5xl"
                  onClick={(e) => e.stopPropagation()}
                >
                  <video
                    ref={expandedRef}
                    src={src}
                    poster={poster}
                    controls
                    autoPlay
                    loop={loop}
                    muted={isMuted}
                    className="w-full rounded-2xl shadow-2xl"
                    onVolumeChange={() => {
                      const v = expandedRef.current
                      if (!v) return
                      setIsMuted(v.muted || v.volume === 0)
                    }}
                  />
                  {caption ? (
                    <div className="mt-3 text-center text-sm text-white/70">
                      {caption}
                    </div>
                  ) : null}
                </div>
              </div>,
              document.body
            )
          : null
      )}
    </>
  )
}

function FileAttachment({ filename, size, url, type }: FileAttachmentProps) {
  const href = url || "#"
  const getIcon = () => {
    if (type?.includes("pdf")) return <FileText className="h-5 w-5" />
    return <File className="h-5 w-5" />
  }

  return (
    <a
      href={href}
      download={filename || undefined}
      className="my-3 flex items-center gap-3 rounded-xl border border-border/60 bg-card/80 p-3 shadow-sm backdrop-blur-sm nb-motion-fast motion-reduce:transition-none group hover:bg-muted/40"
    >
      <div className="rounded-lg bg-muted p-2 text-muted-foreground">{getIcon()}</div>
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{filename}</div>
        {size && <div className="text-sm text-muted-foreground">{size}</div>}
      </div>
      <Download className="h-5 w-5 text-muted-foreground group-hover:text-foreground nb-motion-fast motion-reduce:transition-none" />
    </a>
  )
}

function LinkPreview({ url, title, description, image, favicon }: LinkPreviewProps) {
  let host = url
  try { host = new URL(url).hostname } catch (err) { void err }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="my-4 flex overflow-hidden rounded-xl border border-border/60 bg-card/80 shadow-sm backdrop-blur-sm nb-motion-fast motion-reduce:transition-none group hover:bg-muted/40"
    >
      {image && (
        <div className="w-32 sm:w-48 flex-shrink-0 bg-muted">
          <img src={image || "/placeholder.svg"} alt="" className="w-full h-full object-cover" />
        </div>
      )}
      <div className="flex-1 p-4 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          {favicon && <img src={favicon || "/placeholder.svg"} alt="" className="w-4 h-4" />}
          <span className="text-xs text-muted-foreground truncate">{host}</span>
          <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity nb-duration-micro nb-ease-out motion-reduce:transition-none" />
        </div>
        <div className="font-medium truncate">{title}</div>
        {description && <div className="text-sm text-muted-foreground line-clamp-2 mt-1">{description}</div>}
      </div>
    </a>
  )
}

function MathBlock({ children, inline = false }: MathBlockProps) {
  if (inline) {
    return <span className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-sm">{children}</span>
  }

  return (
    <div className="my-4 overflow-x-auto rounded-xl border border-border/60 bg-card/80 p-4 shadow-sm backdrop-blur-sm">
      <div className="text-center font-mono text-lg">{children}</div>
    </div>
  )
}

function Table({ headers = [], rows = [], caption }: TableProps) {
  return (
    <div className="my-4 overflow-hidden rounded-xl border border-border/60 shadow-sm">
      <table className="w-full text-sm">
	        {caption && (
	          <caption className="border-b border-border/60 bg-muted/30 px-4 py-2 text-start text-muted-foreground">
	            {caption}
	          </caption>
	        )}
        <thead>
          <tr className="bg-muted/30">
            {headers.map((header, i) => (
	              <th
	                key={i}
	                className="border-b border-border/60 px-4 py-3 text-start font-medium text-foreground"
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
              className="border-b border-border/60 nb-motion-fast motion-reduce:transition-none last:border-0 hover:bg-muted/30"
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

function TaskList({ items = [] }: TaskListProps) {
  return (
    <div className="my-4 space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-3">
          <div className={cn("mt-0.5 flex-shrink-0", item.checked ? "text-success" : "text-muted-foreground")}>
            {item.checked ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />}
          </div>
          <span className={cn(item.checked && "line-through text-muted-foreground")}>{item.text}</span>
        </div>
      ))}
    </div>
  )
}

function Callout({ type = "info", title, children }: CalloutProps) {
  const styles: Record<CalloutType, { bg: string; border: string; icon: React.ReactNode; title: string }> = {
    info: {
      bg: "bg-info/10",
      border: "border-info/30",
      icon: <Info className="h-5 w-5 text-info" />,
      title: "text-info",
    },
    warning: {
      bg: "bg-warning/10",
      border: "border-warning/30",
      icon: <AlertTriangle className="h-5 w-5 text-warning" />,
      title: "text-warning",
    },
    error: {
      bg: "bg-destructive/10",
      border: "border-destructive/30",
      icon: <AlertCircle className="h-5 w-5 text-destructive" />,
      title: "text-destructive",
    },
    success: {
      bg: "bg-success/10",
      border: "border-success/30",
      icon: <CheckCircle2 className="h-5 w-5 text-success" />,
      title: "text-success",
    },
  }

  const s = styles[type ?? "info"]

  return (
    <div className={cn("my-4 rounded-xl border p-4 shadow-sm backdrop-blur-sm", s.bg, s.border)}>
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
  return <hr className="my-6 border-border/60" />
}

function Kbd({ children }: { children?: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded border border-border/60 bg-muted/50 px-1.5 text-xs font-mono font-medium">
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

function ThinkingContent({
  children,
  duration,
  defaultExpanded = false,
  disableToggle = false,
  onHeaderClick,
}: ThinkingContentProps) {
  const [isExpanded, setIsExpanded] = React.useState(defaultExpanded)

  return (
    <div className="mb-4 rounded-xl border border-border/60 bg-muted/30 px-3 py-2">
      <button
        type="button"
        onClick={() => {
          onHeaderClick?.()
          if (disableToggle) return
          setIsExpanded(!isExpanded)
        }}
        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground nb-motion-fast motion-reduce:transition-none"
      >
        {!disableToggle && (isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />)}
        <Sparkles className="h-3.5 w-3.5" />
        <span>Thought for {duration || "a few seconds"}</span>
      </button>
      {isExpanded && (
        <div className="mt-2 border-s border-border/60 ps-3 text-sm text-muted-foreground leading-relaxed">
          {children}
        </div>
      )}
    </div>
  )
}

function ActionBar({ onCopy, onLike, onDislike, onShare, onRegenerate }: ActionBarProps) {
  const { t } = useI18n()
  return (
    <div className="mt-3 flex items-center gap-1.5">
      <ActionButton onClick={onCopy} aria-label={t("common.copy")} shortcut="Cmd/Ctrl+C">
        <Copy className="h-4 w-4" />
      </ActionButton>
      <ActionButton onClick={onLike} aria-label={t("common.like")} shortcut="L">
        <ThumbsUp className="h-4 w-4" />
      </ActionButton>
      <ActionButton onClick={onDislike} aria-label={t("common.dislike")} shortcut="D">
        <ThumbsDown className="h-4 w-4" />
      </ActionButton>
      <ActionButton onClick={onShare} aria-label={t("common.share")} shortcut="S">
        <Share className="h-4 w-4" />
      </ActionButton>
      <ActionButton onClick={onRegenerate} aria-label={t("common.regenerate")} shortcut="R">
        <RotateCcw className="h-4 w-4" />
      </ActionButton>
      <ActionButton aria-label={t("navbar.moreOptions")} shortcut="M">
        <MoreHorizontal className="h-4 w-4" />
      </ActionButton>
    </div>
  )
}

function ActionButton({ children, onClick, shortcut, ...props }: ActionButtonProps) {
  const label = props["aria-label"] ?? props.title

  const button = (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        // Base styles
        "cursor-pointer rounded-lg text-muted-foreground",
        // Touch-friendly sizing (44px minimum)
        "min-h-[44px] min-w-[44px] p-2.5 sm:min-h-[36px] sm:min-w-[36px] sm:p-1.5",
        // Transitions and interactions
        "nb-motion-fast motion-reduce:transition-none",
        "hover:bg-muted/60 hover:text-foreground",
        "active:bg-muted/80 active:scale-95",
        // Touch optimizations
        "touch-manipulation -webkit-tap-highlight-color-transparent"
      )}
      {...props}
    >
      {children}
    </button>
  )

  if (!label) return button

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="top" shortcut={shortcut}>{label}</TooltipContent>
    </Tooltip>
  )
}

type ChatMessageComponent = React.FC<ChatMessageProps> & {
  CodeBlock: typeof CodeBlock
  InlineCode: typeof InlineCode
  Image: typeof ImageBlock
  Video: typeof VideoBlock
  File: typeof FileAttachment
  Link: typeof LinkPreview
  Math: typeof MathBlock
  Table: typeof Table
  TaskList: typeof TaskList
  Callout: typeof Callout
  Divider: typeof Divider
  Kbd: typeof Kbd
  ThinkingIndicator: typeof ThinkingIndicator
  ThinkingContent: typeof ThinkingContent
  ActionBar: typeof ActionBar
}

const ChatMessage: ChatMessageComponent = ({
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
}) => {
  const isUser = variant === "user"

  if (isUser) {
	    return (
	      <div className={cn("flex w-full justify-end py-3", className)}>
	        <div
	          className={cn(
	            "border border-border/60 bg-muted/70 text-foreground shadow-sm backdrop-blur-sm",
	            "rounded-3xl px-5 py-2.5",
	            "max-w-[85%] sm:max-w-[75%] md:max-w-[70%]",
	            "min-h-[44px] flex items-center",
	          )}
	        >
	          <div dir="auto" className="text-[15px] leading-relaxed">{children}</div>
	        </div>
	      </div>
	    )
	  }

  return (
    <div className={cn("w-full py-4", className)}>
      {isThinking && !children ? (
        <ThinkingIndicator />
      ) : (
        <div className="max-w-5xl">
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
	            dir="auto"
	            className={cn(
	              "leading-relaxed",
	              "[&_p]:font-brand [&_li]:font-brand [&_h1]:font-brand [&_h2]:font-brand [&_h3]:font-brand [&_h4]:font-brand [&_blockquote]:font-brand",
	              "[&_p]:text-[16px] sm:[&_p]:text-[17px]",
	              "[&_li]:text-[16px] sm:[&_li]:text-[17px]",
	              "[&>p]:my-3 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0",
	              "[&>ul]:my-3 [&>ol]:my-3",
	              "[&>ul]:ps-5 [&>ol]:ps-5",
	              "[&>ul>li]:my-1.5 [&>ol>li]:my-1.5",
	              "[&_ul]:list-disc [&_ol]:list-decimal",
	              "[&_li]:ps-1",
	              "[&_ul_ul]:my-1 [&_ol_ol]:my-1 [&_ul_ol]:my-1 [&_ol_ul]:my-1",
	              "[&>h1]:text-2xl [&>h1]:font-semibold [&>h1]:mt-8 [&>h1]:mb-4 [&>h1:first-child]:mt-0",
	              "[&>h2]:text-xl [&>h2]:font-semibold [&>h2]:mt-6 [&>h2]:mb-3 [&>h2:first-child]:mt-0",
	              "[&>h3]:text-lg [&>h3]:font-semibold [&>h3]:mt-5 [&>h3]:mb-2 [&>h3:first-child]:mt-0",
	              "[&>h4]:text-base [&>h4]:font-semibold [&>h4]:mt-4 [&>h4]:mb-2 [&>h4:first-child]:mt-0",
	              "[&>blockquote]:border-s-4 [&>blockquote]:border-border [&>blockquote]:ps-4 [&>blockquote]:italic [&>blockquote]:text-muted-foreground [&>blockquote]:my-4",
	              "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:text-primary/80",
	              "[&_strong]:font-semibold",
	              "[&_mark]:bg-accent/70 [&_mark]:px-1 [&_mark]:rounded",
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
        </div>
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

export { ChatMessage }
