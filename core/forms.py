from django import forms


class LedgerEntryForm(forms.Form):
    description = forms.CharField(max_length=255)
    amount_minor = forms.IntegerField()

    def clean_amount_minor(self):
        value = self.cleaned_data["amount_minor"]
        if value == 0:
            raise forms.ValidationError("Amount must be a nonzero integer.")
        return value
