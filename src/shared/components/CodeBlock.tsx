import React, { useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";

import { cn } from "@/shared/lib/utils";

const syntaxColors = {
  keyword: { default: "text-chart-4" },
  string: { default: "text-chart-2" },
  comment: { default: "text-muted-foreground italic" },
  function: { default: "text-chart-1" },
  number: { default: "text-chart-5" },
  operator: { default: "text-muted-foreground" },
  type: { default: "text-chart-3" },
  variable: { default: "text-foreground" },
};

export interface CodeBlockProps {
  children?: React.ReactNode;
  language?: string;
  filename?: string;
  showLineNumbers?: boolean;
  highlightLines?: number[];
  className?: string;
}

export interface InlineCodeProps {
  children?: React.ReactNode;
  className?: string;
}

function highlightCode(code: unknown, language?: string): React.ReactNode[] {
  const lines = String(code || "").split("\n");

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
    c: [
      "include","define","ifdef","ifndef","endif","if","elif","else","pragma",
      "struct","union","enum","typedef",
      "const","volatile","static","extern","register","auto",
      "return","for","while","do","switch","case","default","break","continue","goto","sizeof",
    ],
    cpp: [
      "include","define","ifdef","ifndef","endif","if","elif","else","pragma",
      "namespace","using","template","typename","class","struct","union","enum","typedef",
      "const","volatile","static","extern","mutable","inline","virtual","override","final","explicit","friend",
      "public","private","protected",
      "return","for","while","do","switch","case","default","break","continue","goto","sizeof","new","delete","this",
      "try","catch","throw",
      "true","false","nullptr",
    ],
    "c++": [],
  };

  keywords["c++"] = keywords.cpp;

  const types: Record<string, string[]> = {
    python: [
      "int","str","float","bool","list","dict","tuple","set","Optional","List","Dict","Tuple","Set","Any","Union","Callable",
    ],
    typescript: [
      "string","number","boolean","void","any","unknown","never","object","Array","Promise","Record","Partial","Required",
      "Pick","Omit","Exclude","Extract","ReturnType","Parameters",
    ],
    tsx: [
      "string","number","boolean","void","any","unknown","never","object","Array","Promise","Record","Partial","Required",
      "Pick","Omit","Exclude","Extract","ReturnType","Parameters","React","ReactNode","FC","Component",
    ],
    rust: [
      "i8","i16","i32","i64","i128","isize","u8","u16","u32","u64","u128","usize","f32","f64","bool","char","str",
      "String","Vec","Box","Rc","Arc","Option","Result","Ok","Err","Some","None",
    ],
    go: [
      "int","int8","int16","int32","int64","uint","uint8","uint16","uint32","uint64","float32","float64","complex64",
      "complex128","bool","string","byte","rune","error",
    ],
    c: ["void","char","short","int","long","float","double","signed","unsigned","size_t","ptrdiff_t","bool","_Bool"],
    cpp: [
      "void","char","short","int","long","float","double","signed","unsigned","size_t","ptrdiff_t","bool","wchar_t",
      "nullptr_t","std","string","vector","map","set","optional","variant","unique_ptr","shared_ptr",
    ],
    "c++": [],
  };

  types["c++"] = types.cpp;

  const lang = (language || "default").toLowerCase();
  const langKeywords = keywords[lang] || keywords.javascript || [];
  const langTypes = types[lang] || [];

  return lines.map((line, lineIndex) => {
    const tokens: React.ReactNode[] = [];
    let remaining = line;
    let tokenIndex = 0;

    while (remaining.length > 0) {
      let matched = false;

      if (remaining.startsWith("//") || remaining.startsWith("#") || remaining.startsWith("--")) {
        tokens.push(
          <span key={`${lineIndex}-${tokenIndex++}`} className={syntaxColors.comment.default}>
            {remaining}
          </span>
        );
        remaining = "";
        matched = true;
      } else if (remaining.startsWith("/*") || remaining.startsWith("'''") || remaining.startsWith('"""')) {
        tokens.push(
          <span key={`${lineIndex}-${tokenIndex++}`} className={syntaxColors.comment.default}>
            {remaining}
          </span>
        );
        remaining = "";
        matched = true;
      } else {
        const m1 = remaining.match(/^"(?:[^"\\]|\\.)*"/);
        if (m1) {
          tokens.push(
            <span key={`${lineIndex}-${tokenIndex++}`} className={syntaxColors.string.default}>
              {m1[0]}
            </span>
          );
          remaining = remaining.slice(m1[0].length);
          matched = true;
        }
      }

      if (!matched) {
        const m2 = remaining.match(/^'(?:[^'\\]|\\.)*'/);
        if (m2) {
          tokens.push(
            <span key={`${lineIndex}-${tokenIndex++}`} className={syntaxColors.string.default}>
              {m2[0]}
            </span>
          );
          remaining = remaining.slice(m2[0].length);
          matched = true;
        }
      }

      if (!matched) {
        const m3 = remaining.match(/^`(?:[^`\\]|\\.)*`/);
        if (m3) {
          tokens.push(
            <span key={`${lineIndex}-${tokenIndex++}`} className={syntaxColors.string.default}>
              {m3[0]}
            </span>
          );
          remaining = remaining.slice(m3[0].length);
          matched = true;
        }
      }

      if (!matched) {
        const m4 = remaining.match(/^-?\d+\.?\d*(e[+-]?\d+)?/i);
        if (m4) {
          tokens.push(
            <span key={`${lineIndex}-${tokenIndex++}`} className={syntaxColors.number.default}>
              {m4[0]}
            </span>
          );
          remaining = remaining.slice(m4[0].length);
          matched = true;
        }
      }

      if (!matched) {
        const m5 = remaining.match(/^[a-zA-Z_]\w*/);
        if (m5) {
          const word = m5[0];

          if (langKeywords.includes(word)) {
            tokens.push(
              <span key={`${lineIndex}-${tokenIndex++}`} className={syntaxColors.keyword.default}>
                {word}
              </span>
            );
          } else if (langTypes.includes(word)) {
            tokens.push(
              <span key={`${lineIndex}-${tokenIndex++}`} className={syntaxColors.type.default}>
                {word}
              </span>
            );
          } else if (remaining.slice(word.length).match(/^\s*\(/)) {
            tokens.push(
              <span key={`${lineIndex}-${tokenIndex++}`} className={syntaxColors.function.default}>
                {word}
              </span>
            );
          } else {
            tokens.push(
              <span key={`${lineIndex}-${tokenIndex++}`} className={syntaxColors.variable.default}>
                {word}
              </span>
            );
          }

          remaining = remaining.slice(word.length);
          matched = true;
        }
      }

      if (!matched) {
        const m6 = remaining.match(/^[+\-*/%=<>!&|^~?:;,.()[\]{}@#]+/);
        if (m6) {
          tokens.push(
            <span key={`${lineIndex}-${tokenIndex++}`} className={syntaxColors.operator.default}>
              {m6[0]}
            </span>
          );
          remaining = remaining.slice(m6[0].length);
          matched = true;
        }
      }

      if (!matched) {
        tokens.push(remaining[0]);
        remaining = remaining.slice(1);
      }
    }

    return (
      <React.Fragment key={lineIndex}>
        {tokens}
        {lineIndex < lines.length - 1 && "\n"}
      </React.Fragment>
    );
  });
}

export function CodeBlock({
  children,
  language,
  filename,
  showLineNumbers = false,
  highlightLines,
  className,
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const lines = useMemo(() => String(children || "").split("\n"), [children]);
  const label = String(filename || language || "").trim();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(String(children || ""));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // no-op
    }
  };

  return (
    <div
      className={cn(
        "my-4 overflow-hidden rounded-xl border border-border/60 bg-muted/30 shadow-sm backdrop-blur-sm",
        className
      )}
    >
      <div className="flex items-center justify-between border-b border-border/60 bg-muted/40 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="truncate">{label || "code"}</span>
        </div>
        <button
          type="button"
          onClick={copy}
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
  );
}

export function InlineCode({ children, className }: InlineCodeProps) {
  return (
    <code
      className={cn(
        "rounded-md border border-border/60 bg-muted/50 px-1.5 py-0.5 font-mono text-[13px] text-foreground",
        className
      )}
    >
      {children}
    </code>
  );
}
