import("stdfaust.lib"); drive=hslider("drive",0.2,0,1,0.01); process=par(i,2,ef.cubicnl(drive,0));
