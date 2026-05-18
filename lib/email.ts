import { Resend } from "resend";
import type { Report } from "@/types/domain";

type ReportEmailData = Pick<Report, "type" | "outlet_name" | "staff_name" | "date" | "submitted_at"> & {
  itemCount: number;
};

export async function sendReportNotification(data: ReportEmailData) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.NOTIFICATION_EMAIL;
  if (!apiKey || !to) return;

  const resend = new Resend(apiKey);
  await resend.emails.send({
    from: process.env.EMAIL_FROM || "Sistem Absensi <absensi@rotibakarngeunah.com>",
    to,
    subject: `[${data.type}] Laporan ${data.outlet_name} - ${data.date}`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5">
        <h2>Laporan ${data.type}</h2>
        <p><strong>Outlet:</strong> ${data.outlet_name}</p>
        <p><strong>Staff:</strong> ${data.staff_name}</p>
        <p><strong>Tanggal:</strong> ${data.date}</p>
        <p><strong>Jumlah foto item:</strong> ${data.itemCount}</p>
        <p><strong>Submit:</strong> ${data.submitted_at}</p>
      </div>
    `
  });
}
