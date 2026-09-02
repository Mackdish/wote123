import hodStamp from "@/assets/hod-stamp.png";
import iqaStamp from "@/assets/iqa-stamp.png";

type Props = {
  role: "hod" | "iqa";
  approverName?: string | null;
  date?: string | null;
};

const STAMP_SRC: Record<Props["role"], string> = {
  hod: hodStamp,
  iqa: iqaStamp,
};

const ROLE_LABEL: Record<Props["role"], string> = {
  hod: "Head of Department",
  iqa: "IQA Officer",
};

function currentStampDate() {
  return new Date().toLocaleDateString();
}

export function ApprovalStamp({ role, approverName, date }: Props) {
  const formatted = currentStampDate();
  const dateLine = `DATE: ${formatted}: APPROVED`;
  return (
    <div
      className="inline-flex flex-col items-center gap-1 select-none"
      style={{ transform: "rotate(-6deg)" }}
      aria-label={`Approved stamp — ${ROLE_LABEL[role]}`}
    >
      <div className="relative" style={{ width: 220 }}>
        <img
          src={STAMP_SRC[role]}
          alt={`${ROLE_LABEL[role]} approval stamp`}
          className="h-auto w-full"
        />
        {role === "hod" && (
          <div className="absolute inset-x-0 bottom-[25px] text-center text-[10px] font-bold text-[#6d2f92]">
            {dateLine}
          </div>
        )}
      </div>
      {role === "iqa" && (
        <div className="text-[10px] font-bold text-[#1e3a8a]">{dateLine}</div>
      )}
      {/* Verifier names are intentionally not shown on the stamp. */}
    </div>
  );
}
