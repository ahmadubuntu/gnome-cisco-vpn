export default class SettingsManager{

    constructor(settings){
        this.settings=settings;
    }

    username(){
        return this.settings.get_string("username");
    }

    gateway(){

        return this.settings.get_string("gateway")
            || "safehome.charisma.ir:37891";

    }

    certificate(){

        return this.settings.get_string("cert-pin");

    }

    saveCertificate(pin){

        this.settings.set_string(
            "cert-pin",
            pin
        );

    }

}