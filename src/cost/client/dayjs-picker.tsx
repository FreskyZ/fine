import React from 'react';
import { Dayjs } from 'dayjs';
import dayjsGenerateConfig from 'rc-picker/lib/generate/dayjs';
import generatePicker from 'antd/es/date-picker/generatePicker';
import { PickerTimeProps } from 'antd/es/date-picker/generatePicker';

const DatePicker = generatePicker<Dayjs>(dayjsGenerateConfig);
const TimePicker = React.forwardRef<any, TimePickerProps>((props, ref) => {
  return <DatePicker {...props} picker="time" mode={undefined} ref={ref} />;
});
TimePicker.displayName = 'TimePicker';

export interface TimePickerProps extends Omit<PickerTimeProps<Dayjs>, 'picker'> {}
export { DatePicker, TimePicker };
