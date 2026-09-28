import { NextRequest, NextResponse } from "next/server";
import { transcribeAudio } from "@/services/trasncription-service";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const audioFile = formData.get("audio") as File | null;

  if (!audioFile) {
    return NextResponse.json(
      { error: "No audio file provided", text: "" },
      { status: 400 },
    );
  }

  const result = await transcribeAudio(audioFile);

  if (result.error) {
    // El cliente lee `error` del cuerpo antes de mirar el status, así que el
    // cuerpo lo lleva siempre.
    return NextResponse.json(
      { error: result.error, text: "" },
      { status: result.errorCode === "FILE_TOO_LARGE" ? 413 : 500 },
    );
  }

  return NextResponse.json({ text: result.text });
}
