import { CANCEL_CIRCLE_PATH } from '@icons/cancel_circle_path';
import { SvgIcon, SxProps, Theme } from '@mui/material';

type IconProps = {
  color?: string;
  width?: number;
  height?: number;
  sx?: SxProps<Theme>;
  className?: string;
};

const IconCancelCicle = ({
  color = '#222222',
  width = 24,
  height = 24,
  sx = {},
  className,
}: IconProps) => {
  return (
    <SvgIcon
      className={`organized-icon-cancel-cicle ${className}`}
      sx={{ width: `${width}px`, height: `${height}px`, ...sx }}
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* no mask: a hidden copy elsewhere on the page would blank this one, as they share its id */}
        <g>
          <path d={CANCEL_CIRCLE_PATH} fill={color} />
        </g>
      </svg>
    </SvgIcon>
  );
};

export default IconCancelCicle;
