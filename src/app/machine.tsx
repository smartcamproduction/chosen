import { useTranslation } from 'react-i18next';

import { MachineScreen } from '@/components/machine/MachineScreen';
import { StepHeader } from '@/components/StepHeader';

/** The machine after committing: fun spins, lock state, Fast Pivot, Elite second slot. */
export default function Machine() {
  const { t } = useTranslation();
  return <MachineScreen header={<StepHeader title={t('today.machineTitle')} />} />;
}
