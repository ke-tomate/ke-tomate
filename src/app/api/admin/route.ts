import { NextRequest, NextResponse } from "next/server";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO = "ke-tomate/ke-tomate";
const FILE_PATH = "public/content.json";
const BRANCH = "main";

function validatePassword(password: string): boolean {
  if (!ADMIN_PASSWORD) return false;
  return password === ADMIN_PASSWORD;
}

// POST /api/admin - Login
export async function POST(req: NextRequest) {
  try {
    const { action, password, content, token } = await req.json();

    if (action === "login") {
      if (!validatePassword(password)) {
        return NextResponse.json({ error: "Contrase√±a incorrecta" }, { status: 401 });
      }
      const sessionToken = Buffer.from(`${password}:${Date.now()}`).toString("base64");
      return NextResponse.json({ token: sessionToken });
    }

    if (action === "publish") {
      // Validate token
      if (!token) {
        return NextResponse.json({ error: "No autorizado" }, { status: 401 });
      }
      try {
        const decoded = Buffer.from(token, "base64").toString();
        const [pwd] = decoded.split(":");
        if (!validatePassword(pwd)) {
          return NextResponse.json({ error: "Token inv√°lido" }, { status: 401 });
        }
      } catch {
        return NextResponse.json({ error: "Token inv√°lido" }, { status: 401 });
      }

      if (!GITHUB_TOKEN) {
        return NextResponse.json(
          { error: "GITHUB_TOKEN no configurado en el servidor" },
          { status: 500 }
        );
      }

      // Get current file SHA from GitHub
      const getRes = await fetch(
        `https://api.github.com/repos/${REPO}/contents/${FILE_PATH}?ref=${BRANCH}`,
        {
          headers: {
            Authorization: `Bearer ${GITHUB_TOKEN}`,
            Accept: "application/vnd.github.v3+json",
          },
        }
      );

      if (!getRes.ok) {
        const err = await getRes.text();
        return NextResponse.json(
          { error: "Error al obtener archivo de GitHub", details: err },
          { status: 500 }
        );
      }

      const fileData = await getRes.json();
      const currentSha = fileData.sha;

      // Update file via GitHub API
      const contentBase64 = Buffer.from(
        JSON.stringify(content, null, 2)
      ).toString("base64");

      const updateRes = await fetch(
        `https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${GITHUB_TOKEN}`,
            "Content-Type": "application/json",
            Accept: "application/vnd.github.v3+json",
          },
          body: JSON.stringify({
            message: "Actualizar contenido desde admin portal",
            content: contentBase64,
            sha: currentSha,
            branch: BRANCH,
          }),
        }
      );

      if (!updateRes.ok) {
        const err = await updateRes.text();
        return NextResponse.json(
          { error: "Error al actualizar en GitHub", details: err },
          { status: 500 }
        );
      }

      // Also update the local file so the preview updates immediately
      const fs = await import("fs/promises");
      const path = await import("path");
      const filePath = path.join(process.cwd(), "public", "content.json");
      await fs.writeFile(filePath, JSON.stringify(content, null, 2), "utf-8");

      return NextResponse.json({
        success: true,
        message: "Contenido actualizado. El sitio se actualizar√° en 1-2 minutos.",
      });
    }

    return NextResponse.json({ error: "Acci√≥n no v√°lida" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: "Error del servidor", details: String(error) },
      { status: 500 }
    );
  }
}
