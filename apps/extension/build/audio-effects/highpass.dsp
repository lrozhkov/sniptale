import("stdfaust.lib"); frequency=hslider("frequency[unit:Hz]",80,20,20000,1); process=par(i,2,fi.highpass(2,frequency));
