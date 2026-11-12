import("stdfaust.lib"); frequency=hslider("frequency[unit:Hz]",16000,20,20000,1); process=par(i,2,fi.lowpass(2,frequency));
