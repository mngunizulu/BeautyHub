type CalendarAppointment = {
  id: string;
  salon: string;
  address: string;
  services: string[];
  startsAt: Date;
  endsAt: Date;
  stamp: Date;
  sequence: number;
  cancelled: boolean;
};

const timestamp = (value: Date) => value.toISOString().replace(/[-:]|\.\d{3}/g, "");
const escapeText = (value: string) => value.replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/[,;]/g, "\\$&");

function fold(line: string) {
  let bytes = 0;
  let value = "";
  for (const character of line) {
    const size = Buffer.byteLength(character, "utf8");
    if (bytes + size > 75) {
      value += "\r\n ";
      bytes = 1;
    }
    value += character;
    bytes += size;
  }
  return value;
}

export function bookingCalendarFile(appointment: CalendarAppointment) {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//BeautyHub//Appointments//DE",
    "BEGIN:VEVENT",
    "UID:" + appointment.id + "@appointments.beautyhub",
    "DTSTAMP:" + timestamp(appointment.stamp),
    "DTSTART:" + timestamp(appointment.startsAt),
    "DTEND:" + timestamp(appointment.endsAt),
    "SEQUENCE:" + appointment.sequence,
    "STATUS:" + (appointment.cancelled ? "CANCELLED" : "CONFIRMED"),
    "SUMMARY:" + escapeText("BeautyHub - " + appointment.salon),
    "LOCATION:" + escapeText(appointment.address),
    "DESCRIPTION:" + escapeText(appointment.services.join("\n")),
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].map(fold).join("\r\n");
}
