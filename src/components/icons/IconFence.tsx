import { SvgIcon, SxProps, Theme } from '@mui/material';

type IconProps = {
  color?: string;
  width?: number;
  height?: number;
  sx?: SxProps<Theme>;
  className?: string;
};

const IconFence = ({
  color = '#222222',
  width = 24,
  height = 24,
  sx = {},
  className,
}: IconProps) => {
  return (
    <SvgIcon
      className={`organized-icon-fence ${className}`}
      sx={{
        width: `${width}px`,
        height: `${height}px`,
        ...sx,
      }}
    >
      <svg
        width="24"
        height="24"
        viewBox="0 -960 960 960"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <g>
          <path
            d="M210-170v-160h-60v-60h60v-100h-60v-60h60v-125.77l110-110 80 80 81-80 80 80 80-80 110 110V-550h59v60h-59v100h59v60h-59v160H210Zm60-380h100v-101.23l-50-50-50 50V-550Zm160 0h100v-101.23l-50-50-50 50V-550Zm161 0h99v-101.23l-50-50-49 49.38V-550ZM270-390h100v-100H270v100Zm160 0h100v-100H430v100Zm161 0h99v-100h-99v100ZM270-230h100v-100H270v100Zm160 0h100v-100H430v100Zm161 0h99v-100h-99v100Z"
            fill={color}
          />
        </g>
      </svg>
    </SvgIcon>
  );
};

export default IconFence;
