import { z } from "zod";
import { REPORTING_RULES } from "./config";
import { getArea } from "./areas";

const URL_LIKE = /(https?:\/\/|www\.|\.(com|net|org|ng|io|xyz)\b)/i;

export const reportInputSchema = z.object({
  areaId: z.string().min(1).max(64).refine((id) => !!getArea(id), "Unknown neighbourhood"),
  status: z.enum(["on", "off"]),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  comment: z
    .string()
    .trim()
    .max(REPORTING_RULES.commentMaxLength)
    .refine((c) => !URL_LIKE.test(c), "Links are not allowed in comments")
    .optional()
    .transform((c) => (c ? c : undefined)),
  /** Honeypot: real users never see or fill this field. */
  website: z.string().max(0, "Bot detected").optional(),
}).refine((v) => (v.lat === undefined) === (v.lng === undefined), "Send both latitude and longitude, or neither");

export type ReportInput = z.infer<typeof reportInputSchema>;
