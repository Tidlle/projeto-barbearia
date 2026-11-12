import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { WEEKDAYS_SHORT } from "@/lib/time";
import { saveProfessional } from "../actions";
import { Flash, HoursEditor } from "@/components/painel";
import { SubmitButton } from "@/components/submit-button";
import { Avatar, Badge, Card, Field, Input, PageHeader, Textarea } from "@/components/ui";

type Props = { searchParams: Promise<{ ok?: string; erro?: string }> };

export default async function TeamPage({ searchParams }: Props) {
  const user = await requireUser();
  const sp = await searchParams;
  const [pros, services, businessHours] = await Promise.all([
    db.professional.findMany({
      where: { barbershopId: user.barbershopId },
      include: { services: true, workingHours: true },
      orderBy: [{ active: "desc" }, { sortOrder: "asc" }],
    }),
    db.service.findMany({ where: { barbershopId: user.barbershopId }, orderBy: { sortOrder: "asc" } }),
    db.businessHour.findMany({ where: { barbershopId: user.barbershopId } }),
  ]);
  const defaultHours = businessHours.map((h) => ({ weekday: h.weekday, start: h.openTime, end: h.closeTime }));

  return (
    <>
      <PageHeader title="Equipe" description="Profissionais, serviços que cada um faz e horários de atendimento." />
      <Flash ok={sp.ok} erro={sp.erro} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {pros.map((p) => (
            <Card key={p.id}>
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-4 px-5 py-4">
                  <Avatar name={p.name} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {p.name} {!p.active && <Badge className="ml-2">Inativo</Badge>}
                    </p>
                    <p className="text-sm text-stone-500">
                      {p.role} · {p.services.length} serviços ·{" "}
                      {[...new Set(p.workingHours.map((w) => w.weekday))].sort().map((d) => WEEKDAYS_SHORT[d]).join(", ") || "sem horários"}
                    </p>
                  </div>
                  <span className="text-stone-400 transition group-open:rotate-90">›</span>
                </summary>
                <div className="border-t border-stone-100 px-5 py-5">
                  <ProfessionalForm
                    services={services}
                    pro={{
                      ...p,
                      serviceIds: p.services.map((s) => s.serviceId),
                      hours: p.workingHours.map((w) => ({ weekday: w.weekday, start: w.startTime, end: w.endTime })),
                    }}
                  />
                </div>
              </details>
            </Card>
          ))}
        </div>
        <Card className="h-fit p-5">
          <h2 className="mb-4 font-semibold">Novo profissional</h2>
          <ProfessionalForm services={services} defaultHours={defaultHours} />
        </Card>
      </div>
    </>
  );
}

function ProfessionalForm({
  pro,
  services,
  defaultHours = [],
}: {
  pro?: { id: string; name: string; role: string; bio: string | null; active: boolean; serviceIds: string[]; hours: { weekday: number; start: string; end: string }[] };
  services: { id: string; name: string }[];
  defaultHours?: { weekday: number; start: string; end: string }[];
}) {
  return (
    <form action={saveProfessional} className="space-y-4">
      {pro && <input type="hidden" name="id" value={pro.id} />}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nome"><Input name="name" required defaultValue={pro?.name} /></Field>
        <Field label="Função"><Input name="role" defaultValue={pro?.role ?? "Barbeiro"} /></Field>
      </div>
      <Field label="Bio (aparece no site)"><Textarea name="bio" rows={2} defaultValue={pro?.bio ?? ""} /></Field>
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-stone-700">Serviços que realiza</legend>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {services.map((s) => (
            <label key={s.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="services" value={s.id} defaultChecked={pro ? pro.serviceIds.includes(s.id) : true} className="size-4 accent-stone-900" />
              {s.name}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-stone-700">Horário de atendimento</legend>
        <HoursEditor hours={pro?.hours ?? defaultHours} />
        <p className="mt-1 text-xs text-stone-500">Para almoço ou folgas pontuais, use “Bloquear horário” na Agenda.</p>
      </fieldset>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={pro?.active ?? true} className="size-4 accent-stone-900" />
        Ativo (aparece no site e recebe agendamentos)
      </label>
      <SubmitButton>{pro ? "Salvar" : "Adicionar profissional"}</SubmitButton>
    </form>
  );
}
