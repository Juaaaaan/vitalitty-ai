"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, Mic, Send, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DocumentLink } from "@/components/assistant/document-link";
import { ProposalCard } from "@/components/assistant/proposal-card";
import type {
  AssistantEvent,
  AssistantMessage,
  ProposedAction,
} from "@/models/assistant/assistant.models";

/**
 * Conversación del asistente.
 *
 * El hilo vive aquí, en estado de React, y viaja entero en cada petición: no se
 * persiste ninguna conversación. Recargar la deja vacía, y con ella cualquier
 * propuesta pendiente — que es exactamente lo que se quiere, porque una
 * propuesta sin confirmar no ha escrito nada.
 */

/**
 * Lo que se pinta en el hilo. Los documentos son entradas propias, no texto:
 * así el enlace se enseña como enlace y, sobre todo, no viaja en el contexto
 * del modelo. Solo las entradas de tipo mensaje se mandan a la API.
 */
type Entry = { id: string } &
  /**
   * `hidden` marca lo que el modelo necesita ver pero el usuario no: el acuse
   * de una acción confirmada. Sin él la conversación se llena de JSON.
   */
  (| ({ kind: "message"; hidden?: boolean } & AssistantMessage)
    | {
        kind: "document";
        url: string;
        version: number | null;
        fecha: string | null;
      }
  );

const newId = () => Math.random().toString(36).slice(2);

/**
 * El documento de dieta fuera del resultado que vuelve al hilo: son páginas de
 * markdown que llenarían la conversación —y el contexto del modelo— sin aportar
 * nada, porque ya está guardado y se consulta con las herramientas.
 */
function withoutDocument(result: unknown): unknown {
  if (result == null || typeof result !== "object") return result;

  const rest = { ...(result as Record<string, unknown>) };
  delete rest.documento;
  return rest;
}

/** Los mensajes del hilo, sin los documentos: es lo que viaja a la API. */
const messagesOf = (entries: Entry[]): AssistantMessage[] =>
  entries
    .filter(
      (entry): entry is Entry & { kind: "message" } => entry.kind === "message",
    )
    .map(({ role, content }) => ({ role, content }));

export function AssistantChat() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [toolLabel, setToolLabel] = useState<string | null>(null);
  const [proposal, setProposal] = useState<ProposedAction | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const [, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries, toolLabel, proposal]);

  async function send(thread: AssistantMessage[]) {
    setStreaming(true);
    setError(null);
    setProposal(null);

    const answerId = newId();
    let answer = "";
    setEntries((current) => [
      ...current,
      { id: answerId, kind: "message", role: "assistant", content: "" },
    ]);

    const update = (text: string) =>
      setEntries((current) =>
        current.map((entry) =>
          entry.id === answerId ? { ...entry, content: text } : entry,
        ),
      );

    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: thread }),
      });

      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "No se ha podido consultar.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // El servidor emite NDJSON: un evento por línea.
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as AssistantEvent;

          if (event.type === "text") {
            answer += (answer ? "\n\n" : "") + event.text;
            update(answer);
          } else if (event.type === "tool_start") {
            setToolLabel(event.label);
          } else if (event.type === "tool_end") {
            setToolLabel(null);
          } else if (event.type === "document") {
            const { url, version, fecha } = event;
            setEntries((current) => [
              ...current,
              { id: newId(), kind: "document", url, version, fecha },
            ]);
          } else if (event.type === "proposal") {
            setProposal(event.action);
          } else if (event.type === "error") {
            setError(event.message);
          }
        }
      }

      // Una vuelta que solo propone no deja texto: el hueco vacío se quita.
      if (!answer) {
        setEntries((current) =>
          current.filter((entry) => entry.id !== answerId),
        );
      }
    } catch (err) {
      setEntries((current) => current.filter((entry) => entry.id !== answerId));
      setError(
        err instanceof Error ? err.message : "No se ha podido consultar.",
      );
    } finally {
      startTransition(() => {
        setStreaming(false);
        setToolLabel(null);
      });
    }
  }

  function handleSubmit() {
    const question = draft.trim();
    if (!question || streaming) return;

    const thread: AssistantMessage[] = [
      ...messagesOf(entries),
      { role: "user", content: question },
    ];

    setEntries((current) => [
      ...current,
      { id: newId(), kind: "message", role: "user", content: question },
    ]);
    setDraft("");
    void send(thread);
  }

  async function handleConfirm() {
    if (!proposal) return;

    setConfirming(true);
    setError(null);

    try {
      const response = await fetch("/api/assistant/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: proposal.tool, input: proposal.input }),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(body.error ?? "No se ha guardado nada.");

      setProposal(null);
      // El resultado vuelve a la conversación como un mensaje del usuario: es
      // lo que permite al asistente contarlo y seguir desde ahí. Sin el
      // documento entero, que ocupa páginas y ya está guardado.
      const done: AssistantMessage = {
        role: "user",
        content: `[Acción confirmada y ejecutada: ${proposal.summary}]\nResultado: ${JSON.stringify(withoutDocument(body.result))}`,
      };
      // Un PDF recién creado vuelve en el resultado de la acción, no por el
      // stream: la confirmación no pasa por el bucle.
      const documento = (
        body.result as {
          documento?: {
            url: string;
            version: number | null;
            fecha: string | null;
          };
        }
      )?.documento;

      setEntries((current) => [
        ...current,
        { id: newId(), kind: "message" as const, hidden: true, ...done },
        ...(documento
          ? [{ id: newId(), kind: "document" as const, ...documento }]
          : []),
      ]);
      void send([...messagesOf(entries), done]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se ha guardado nada.");
    } finally {
      setConfirming(false);
    }
  }

  async function startRecording() {
    setError(null);
    chunksRef.current = [];

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    recorderRef.current = recorder;

    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    });

    recorder.addEventListener("stop", () => {
      stream.getTracks().forEach((track) => track.stop());
      void transcribe(new Blob(chunksRef.current, { type: "audio/webm" }));
    });

    recorder.start(500);
    setRecording(true);
  }

  function stopRecording() {
    recorderRef.current?.stop();
    setRecording(false);
  }

  /**
   * Lo dictado NO se envía solo: cae en el cuadro de entrada para poder
   * corregirlo. Una palabra mal transcrita dispararía si no una vuelta entera
   * del asistente sobre el paciente equivocado.
   */
  async function transcribe(audio: Blob) {
    setTranscribing(true);

    try {
      const form = new FormData();
      form.append("audio", audio, "audio.webm");

      const response = await fetch("/api/transcribe", {
        method: "POST",
        body: form,
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(body.error ?? "No se ha podido transcribir el audio.");
      }
      if (!body.text?.trim()) {
        throw new Error("La transcripción volvió vacía. Vuelve a dictarlo.");
      }

      setDraft((current) => (current ? `${current} ${body.text}` : body.text));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se ha podido transcribir el audio.",
      );
    } finally {
      setTranscribing(false);
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-6rem)] w-full max-w-3xl flex-col gap-4 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Asistente</h1>
        <p className="text-sm text-muted-foreground">
          Pregunta por tus pacientes, sus dietas y tu agenda. Nada se guarda sin
          que lo confirmes.
        </p>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto pr-1">
        {entries.length === 0 && !streaming && (
          <p className="text-sm text-muted-foreground">
            Por ejemplo: «¿qué pacientes tienen revisión esta semana?» o
            «compara la última dieta de Rubén con la anterior».
          </p>
        )}

        {entries.map((entry) =>
          entry.kind === "message" && entry.hidden ? null : entry.kind ===
            "document" ? (
            <DocumentLink
              key={entry.id}
              url={entry.url}
              version={entry.version}
              fecha={entry.fecha}
            />
          ) : (
            <div
              key={entry.id}
              className={
                entry.role === "user"
                  ? "ml-auto max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
                  : "max-w-[85%] rounded-lg bg-muted px-3 py-2 text-sm whitespace-pre-wrap"
              }
            >
              {entry.content}
            </div>
          ),
        )}

        {toolLabel && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {toolLabel}
          </p>
        )}

        {proposal && (
          <ProposalCard
            action={proposal}
            pending={confirming}
            onConfirm={handleConfirm}
            onDiscard={() => setProposal(null)}
          />
        )}

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="flex items-end gap-2">
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              handleSubmit();
            }
          }}
          placeholder="Escribe tu pregunta…"
          aria-label="Pregunta para el asistente"
          rows={2}
          disabled={streaming}
        />

        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={recording ? "Detener dictado" : "Dictar la pregunta"}
          onClick={recording ? stopRecording : startRecording}
          disabled={streaming || transcribing}
        >
          {transcribing ? (
            <Loader2 className="size-4 animate-spin" />
          ) : recording ? (
            <Square className="size-4" />
          ) : (
            <Mic className="size-4" />
          )}
        </Button>

        <Button
          type="button"
          size="icon"
          aria-label="Enviar"
          onClick={handleSubmit}
          disabled={streaming || !draft.trim()}
        >
          {streaming ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
