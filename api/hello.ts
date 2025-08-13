// api/hello.ts
export async function GET(request: Request) {
  const url = new URL(request.url);
  const name = url.searchParams.get('name') ?? 'GRIFFIN';
  return Response.json({ message: `Peter ${name}!` });
}
