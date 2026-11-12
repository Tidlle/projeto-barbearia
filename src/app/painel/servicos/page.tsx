import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDuration, formatMoney } from "@/lib/format";
import { saveService } from "../actions";
import { Flash } from "@/components/painel";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Card, Field, Input, PageHeader } from "@/components/ui";

type Props = { searchParams: Promise<{ ok?: string; erro?: string }> };

export default async function ServicesPage({ searchParams }: Props) {
  const user = await requireUser();
  const sp = await searchParams;
  const services = await db.service.findMany({
    where: { barbershopId: user.barbershopId },
    orderBy: [{ active: "desc" }, { sortOrder: "asc" }],
    include: { _count: { select: { appointments: { where: { status: "COMPLETED" } } } } },
  });

  return (
    <>
      <PageHeader title="Serviços" description="O que aparece no site e no agendamento online." />
      <Flash ok={sp.ok} erro={sp.erro} />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <ul className="divide-y divide-stone-100">
            {services.map((s) => (
              <li key={s.id}>
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-4 px-5 py-4 hover:bg-stone-50">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {s.name} {!s.active && <Badge className="ml-2">Inativo</Badge>}
                      </p>
                      <p className="text-sm text-stone-500">
                        {s.category ?? "Sem categoria"} · {formatDuration(s.durationMinutes)} · {s._count.appointments} realizados
                      </p>
                    </div>
                    <span className="font-semibold tabular-nums">{formatMoney(s.priceCents)}</span>
                    <span className="text-stone-400 transition group-open:rotate-90">›</span>
                  </summary>
                  <div className="border-t border-stone-100 bg-stone-50 px-5 py-4">
                    <ServiceForm service={s} />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="h-fit p-5">
          <h2 className="mb-4 font-semibold">Novo serviço</h2>
          <ServiceForm />
        </Card>
      </div>
    </>
  );
}

function ServiceForm({
  service,
}: {
  service?: { id: string; name: string; description: string | null; category: string | null; durationMinutes: number; priceCents: number; active: boolean };
}) {
  return (
    <form action={saveService} className="space-y-3">
      {service && <input type="hidden" name="id" value={service.id} />}
      <Field label="Nome"><Input name="name" required defaultValue={service?.name} /></Field>
      <Field label="Descrição"><Input name="description" defaultValue={service?.description ?? ""} /></Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Categoria"><Input name="category" defaultValue={service?.category ?? ""} placeholder="Cabelo" /></Field>
        <Field label="Duração (min)"><Input name="duration" type="number" min={5} step={5} required defaultValue={service?.durationMinutes ?? 30} /></Field>
        <Field label="Preço (R$)">
          <Input name="price" inputMode="decimal" required defaultValue={service ? (service.priceCents / 100).toFixed(2).replace(".", ",") : ""} placeholder="60,00" />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={service?.active ?? true} className="size-4 accent-stone-900" />
        Disponível para agendamento online
      </label>
      <SubmitButton>{service ? "Salvar alterações" : "Adicionar serviço"}</SubmitButton>
    </form>
  );
}
