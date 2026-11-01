"use client";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useI18n } from "@/lib/i18n/client";

const tooltipStyle = { background: "#111121", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12, fontSize: 12, color: "#fff" };
const axis = { stroke: "#A1A1B5", fontSize: 11, tickLine: false, axisLine: false } as const;

export function DailyChart({ data }: { data: { day: string; calls: number; chats: number }[] }) {
  const { locale } = useI18n();
  return (
    <div className="h-64 w-full" dir="ltr">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 10, right: 6, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="gCalls" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8B5CF6" stopOpacity={0.5} /><stop offset="1" stopColor="#8B5CF6" stopOpacity={0} /></linearGradient>
            <linearGradient id="gChats" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#38BDF8" stopOpacity={0.35} /><stop offset="1" stopColor="#38BDF8" stopOpacity={0} /></linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,.05)" vertical={false} />
          <XAxis dataKey="day" {...axis} interval={4} />
          <YAxis {...axis} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: "rgba(255,255,255,.15)" }} />
          <Area type="monotone" dataKey="chats" name={locale === "ar" ? "محادثات" : "Conversations"} stroke="#38BDF8" strokeWidth={2} fill="url(#gChats)" />
          <Area type="monotone" dataKey="calls" name={locale === "ar" ? "مكالمات" : "Calls"} stroke="#8B5CF6" strokeWidth={2.5} fill="url(#gCalls)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MonthlyChart({ data }: { data: { month: string; calls: number; chats: number }[] }) {
  const { locale } = useI18n();
  return (
    <div className="h-64 w-full" dir="ltr">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 10, right: 6, left: -18, bottom: 0 }} barGap={4}>
          <CartesianGrid stroke="rgba(255,255,255,.05)" vertical={false} />
          <XAxis dataKey="month" {...axis} />
          <YAxis {...axis} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(255,255,255,.04)" }} />
          <Bar dataKey="calls" name={locale === "ar" ? "مكالمات" : "Calls"} fill="#8B5CF6" radius={[6, 6, 0, 0]} />
          <Bar dataKey="chats" name={locale === "ar" ? "محادثات" : "Conversations"} fill="#38BDF8" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
